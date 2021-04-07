use futures::stream::StreamExt;
use std::collections::{HashMap, HashSet, VecDeque};
use tokio::sync::{mpsc, Mutex, Notify, RwLock};
pub use tonic::{Request, Response, Status};
use tokio_stream;
use std::sync::Arc;
use uuid::Uuid;

use crate::proto::pubsub as rpc;
use rpc::pubsub_client::PubsubClient;
use rpc::pubsub_server::Pubsub;

#[tonic::async_trait]
impl Pubsub for PubsubService {
    /* 
    async fn create_topic(
        &self,
        request: Request<rpc::Topic>,
    ) -> Result<Response<rpc::Topic>, tonic::Status> {
        //println!("Got a request: {:?}", request);

        let topic = request.into_inner();
        self.ctx.create_topic(&topic.name).await;
        Ok(Response::new(topic))
    }
    */

    async fn create_subscription(
        &self,
        request: Request<rpc::Subscription>,
    ) -> Result<Response<rpc::Subscription>, Status> {
        //println!("Got a request: {:?}", request);

        let subscription = request.into_inner();

        match self
            .ctx
            .create_subscription(&subscription.topic, &subscription.name)
            .await
        {
            Ok(_) => Ok(Response::new(subscription)),
            Err(e) => {
                Err(Status::new(tonic::Code::AlreadyExists, e.to_string()))
            }
        }
    }

    async fn delete_subscription(
        &self,
        request: Request<rpc::DeleteSubscriptionRequest>,
    ) -> Result<Response<rpc::Empty>, Status> {
        //println!("Got a request: {:?}", request);

        let subscription = request.into_inner();

        self.ctx.delete_subscription(&subscription.name).await;

        Ok(Response::new(rpc::Empty {}))
    }

    async fn publish(
        &self,
        request: Request<rpc::PublishRequest>,
    ) -> Result<Response<rpc::PublishResponse>, Status> {
        //println!("Got a request: {:?}", request);

        let req = request.into_inner();

        let res = self.ctx.publish(&req.topic, req.message.unwrap()).await;
        match res {
            Ok(_) => Ok(Response::new(rpc::PublishResponse {
                message_id: Uuid::new_v4().to_hyphenated().to_string(),
            })),
            Err(e) => Err(Status::new(tonic::Code::NotFound, e.to_string())),
        }
    }

    async fn pull(
        &self,
        request: Request<rpc::PullRequest>,
    ) -> Result<Response<rpc::PullResponse>, Status> {
        //println!("Got a request: {:?}", request);

        let req = request.into_inner();

        let res = self.ctx.pull(&req.subscription).await;
        match res {
            Ok(data) => Ok(Response::new(rpc::PullResponse { message: data })),
            Err(e) => Err(Status::new(tonic::Code::NotFound, e.to_string())),
        }
    }

    type StreamingPullStream =
        tokio_stream::wrappers::ReceiverStream<Result<rpc::StreamingPullResponse, Status>>;

    async fn streaming_pull(
        &self,
        request: Request<rpc::StreamingPullRequest>,
    ) -> Result<Response<Self::StreamingPullStream>, Status> {
        //println!("Got a request: {:?}", request);

        let req = request.into_inner();
        if !self.ctx.contains_subscription(&req.subscription).await {
            return Err(Status::new(
                tonic::Code::NotFound,
                "subscription is not found",
            ));
        }

        let (tx, rx) = mpsc::channel(10);
        let ctx = Arc::clone(&self.ctx);
        tokio::spawn(async move {
            loop {
                let res = ctx.pull(&req.subscription).await;
                if res.is_err() {
                    // NotFound
                    println!("subscription not found");
                    break;
                }

                let data = res.unwrap();
                if data.is_none() {
                    // data is none when
                    // - subscription.detached is true
                    // - subscription id is not correct
                    break;
                } else {
                    let response = rpc::StreamingPullResponse { message: data };
                    let res = tx.send(Ok(response)).await.map_err(|err| {
                        eprintln!("StreamingPull: Send Err");
                        err
                    });
                    if res.is_err() {
                        break;
                    }
                }
            }
        });

        println!("StremingPull: Response");
        Ok(Response::new(tokio_stream::wrappers::ReceiverStream::new(
            rx,
        )))
    }
}

pub struct PubsubService {
    ctx: Arc<PubsubContext>,
}

impl PubsubService {
    pub fn new() -> Self {
        Self {
            ctx: Arc::new(PubsubContext::new()),
        }
    }
}

pub type TopicId = String;
pub type SubscriptionId = String;


#[derive(Debug)]
pub enum Error {
    NotFound,
    AlreadyExists,
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

impl std::error::Error for Error {}

pub struct Subscription {
    topic: TopicId,
    messages: Mutex<VecDeque<rpc::PubsubMessage>>,
    notify: Notify,
    detached: RwLock<bool>,
}

struct PubsubContext {
    topics: RwLock<HashMap<TopicId, HashSet<SubscriptionId>>>,
    subscriptions: RwLock<HashMap<SubscriptionId, Arc<Subscription>>>,
}

impl PubsubContext {
    pub fn new() -> Self {
        Self {
            topics: RwLock::new(HashMap::new()),
            subscriptions: RwLock::new(HashMap::new()),
        }
    }

    async fn create_topic(&self, topic_id: &str) {
        self.topics
            .write()
            .await
            .entry(topic_id.into())
            .or_default();
    }

    async fn create_topic_with_subscription_id(&self, topic_id: &str, sub_id: &str) {
        self.topics
            .write()
            .await
            .entry(topic_id.into())
            .or_default()
            .insert(sub_id.into());
    }

    pub async fn get_topics(&self) -> Vec<String> {
        self.topics.read().await.keys().map(|x| x.clone()).collect()
    }

    pub async fn create_subscription(
        &self,
        topic_id: &str,
        subscription_id: &str,
    ) -> Result<(), Error> {

        if self.contains_subscription(subscription_id).await {
            return Err(Error::AlreadyExists);
        }

        let sub = Arc::new(Subscription {
            topic: topic_id.into(),
            messages: Mutex::new(VecDeque::new()),
            notify: Notify::new(),
            detached: RwLock::new(false),
        });

        self.subscriptions
            .write()
            .await
            .insert(subscription_id.into(), sub);

        self.create_topic_with_subscription_id(topic_id, subscription_id)
            .await;

        Ok(())
    }

    pub async fn delete_subscription(&self, subscription_id: &str) {
        let topic = if let Some(sub) = self.subscriptions.read().await.get(subscription_id) {
            *sub.detached.write().await = true;
            sub.notify.notify_one();
            sub.topic.clone()
        } else {
            return;
        };

        self.subscriptions.write().await.remove(subscription_id);
        
        if let Some(sub_ids) = self.topics.write().await.get_mut(&topic) {
            sub_ids.remove(subscription_id);
        }
        
        // Delete topic if subscription is empty
        let mut topics = self.topics.write().await;
        let is_empty = if let Some(sub_ids) = topics.get(&topic) {
            sub_ids.is_empty()
        } else {
            false
        };
        if is_empty {
            topics.remove(&topic);
        }
    }

    async fn contains_subscription(&self, subscription_id: &str) -> bool {
        self.subscriptions
            .read()
            .await
            .contains_key(subscription_id)
    }

    pub async fn publish(&self, topic_id: &str, message: rpc::PubsubMessage) -> Result<(), Error> {

        if let Some(sub_ids) = self.topics.read().await.get(topic_id) {
            //sub_ids.to_owned().into_iter().collect::<Vec<String>>()
            for id in sub_ids.iter() {
                let sub = if let Some(sub) = self.subscriptions.read().await.get(id) {
                    sub.clone()
                } else {
                    continue;
                };
    
                let mut messages = sub.messages.lock().await;
                if messages.len() > 100 {
                    continue;
                }
    
                messages.push_back(message.clone());
                sub.notify.notify_one();    
            }
        }
        Ok(())
    }

    pub async fn pull(&self, subscription_id: &str) -> Result<Option<rpc::PubsubMessage>, Error> {
        let sub = match self.subscriptions.read().await.get(subscription_id) {
            Some(sub) => sub.clone(),
            None => return Err(Error::NotFound),
        }; // subscription unlock. Don't whole lock while pulling!

        loop {
            if *sub.detached.read().await {
                return Ok(None);
            }

            if let Some(message) = sub.messages.lock().await.pop_front() {
                return Ok(Some(message));
            }

            sub.notify.notified().await;
        }
    }
}



pub struct Server;

impl Server {
    pub fn start(address: &str) {
        let addr = address.parse().expect("Err: parse address");
        let service = PubsubService::new();

        let _jh = tokio::spawn(async move {
            println!("start grpc server thread");
            let _res = tonic::transport::Server::builder()
                .http2_keepalive_interval(Some(std::time::Duration::from_secs(10)))
                .add_service(rpc::pubsub_server::PubsubServer::new(service))
                .serve(addr)
                .await
                .expect("Error: Start grpc server");
        });
    }
}

pub struct Client {
    client: PubsubClient<tonic::transport::Channel>,
    subs: Vec<String>,
}

impl Client {
    pub async fn connect(address: String) -> Result<Client, tonic::transport::Error> {
        let client = PubsubClient::connect(address).await?;

        Ok(Self {
            client,
            subs: Vec::new(),
        })
    }

    /* 
    pub async fn create_topic(&mut self, name: &str) -> Result<(), tonic::Status> {
        // create topic
        let request = Request::new(rpc::Topic { name: name.to_string() });

        // create topic
        self.client.create_topic(request).await?;
        Ok(())
    }
    */

    pub async fn create_subscription(
        &mut self,
        topic: &str,
        name: &str,
    ) -> Result<(), tonic::Status> {
        // create subscription
        let request = Request::new(rpc::Subscription {
            name: name.into(),
            topic: topic.into(),
        });

        self.client.create_subscription(request).await?;
        self.subs.push(name.into());
        Ok(())
    }

    pub async fn delete_subscription(&mut self, name: &str) -> Result<(), tonic::Status> {
        // delete subscription
        let request = Request::new(rpc::DeleteSubscriptionRequest { name: name.to_string() });

        self.client.delete_subscription(request).await?;
        Ok(())
    }

    pub async fn publish(
        &mut self,
        topic: &str,
        message: rpc::PubsubMessage,
    ) -> Result<(), tonic::Status> {
        let request = Request::new(rpc::PublishRequest {
            topic: topic.into(),
            message: Some(message),
        });

        self.client.publish(request).await?;
        Ok(())
    }

    pub async fn pull(
        &mut self,
        subscription: &str,
    ) -> Result<Option<rpc::PubsubMessage>, tonic::Status> {
        let request = Request::new(rpc::PullRequest {
            subscription: subscription.into(),
        });

        let res = self.client.pull(request).await?;
        Ok(res.into_inner().message)
    }

    pub async fn streaming_pull(
        &mut self,
        subscription: &str,
    ) -> Result<tonic::codec::Streaming<rpc::StreamingPullResponse>, tonic::Status> {
        let request = Request::new(rpc::StreamingPullRequest {
            subscription: subscription.into(),
        });

        let res = self.client.streaming_pull(request).await?;
        Ok(res.into_inner())
    }


    pub async fn subscribe<F>(
        &mut self,
        subscription: &str,
        mut callback: F,
    ) -> Result<(), tonic::Status>
    where
        F: FnMut(Result<rpc::PubsubMessage, tonic::Status>) + Send + Sync + 'static,
    {
        let request = Request::new(rpc::StreamingPullRequest {
            subscription: subscription.into(),
        });

        let mut stream = self.client.streaming_pull(request).await?.into_inner();
        
        let _jh = tokio::spawn({ 
            async move {        
                while let Some(stream) = stream.next().await {
                    match stream {
                        Ok(response) => {
                            if let Some(message) = response.message {
                                callback(Ok(message));
                            }
                        }
                        Err(e) => {
                            callback(Err(e));
                        }
                    }
                }
            }
        });

        Ok(())
    }

    pub async fn close(&mut self) -> Result<(), tonic::Status>{
        while let Some(name) = self.subs.pop() {
            let _res = self.delete_subscription(&name).await;
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn client_test() {
        Server::start("[::1]:50051");
        tokio::time::sleep(time::Duration::from_millis(100)).await;

        let mut client = Client::connect("http://[::1]:50051".to_string())
            .await
            .unwrap();

        let topic_1 = "topic_1";
        let topic_2 = "topic_2";
        let sub_1 = "sub_1";
        let sub_2 = "sub_2";

        /* 
        // create topic
        let res = client.create_topic(topic_1).await;
        assert!(res.is_ok());
        let res = client.create_topic(topic_2).await;
        assert!(res.is_ok());
        */

        // create subscription
        let res = client
            .create_subscription(topic_1, sub_1)
            .await;
        assert!(res.is_ok());

        let res = client
            .create_subscription(topic_1, sub_2)
            .await;
        assert!(res.is_ok());

        // duplicate subscription
        let res = client
            .create_subscription(topic_1, sub_1)
            .await;
        assert!(res.is_err());
        assert_eq!(tonic::Code::AlreadyExists, res.unwrap_err().code());
        
        // publish
        let res = client
            .publish(
                topic_1,
                rpc::PubsubMessage {
                    timestamp: 0,
                    data: "topic_1 message".as_bytes().to_owned(),
                },
            )
            .await;
        assert!(res.is_ok());

        // pull
        let res = client.pull(sub_1).await;
        assert!(res.is_ok());
        let message = res.unwrap();
        assert!(message.is_some());
        let message = message.unwrap();
        assert_eq!(
            "topic_1 message",
            std::str::from_utf8(&message.data).unwrap()
        );

        let res = client.pull(sub_2).await;
        assert!(res.is_ok());
        let message = res.unwrap();
        assert!(message.is_some());
        let message = message.unwrap();
        assert_eq!(
            "topic_1 message",
            std::str::from_utf8(&message.data).unwrap()
        );

        // prepare message for subscribe
        for i in 0..10 as i32 {
            let res = client
                .publish(
                    topic_1,
                    rpc::PubsubMessage {
                        timestamp: 0,
                        data: format!("topic_1 message {}", i).as_bytes().to_owned(),
                    },
                )
                .await;
            assert!(res.is_ok());
        }

        let mut index = 0i32;
        let res = client
            .subscribe(sub_1, move |msg| {
                if msg.is_err() {
                    return;
                }
                let msg = msg.unwrap();
                let message = std::str::from_utf8(&msg.data).unwrap();
                println!("STREAM REV: {}", index);
                assert_eq!(
                    format!("topic_1 message {}", index),
                    message
                );
                index += 1;
            })
            .await;
        assert!(res.is_ok());

        // nop 
        tokio::time::sleep(time::Duration::from_millis(300)).await;

        // delete subscription
        let res = client.delete_subscription(sub_1).await;
        assert!(res.is_ok());
        let res = client.delete_subscription(sub_2).await;
        assert!(res.is_ok());

        // streaming pull, cancel test 
        let res = client
            .create_subscription(topic_1, sub_1)
            .await;
        assert!(res.is_ok());
        // cancel 
        let jh = tokio::spawn(async {
            tokio::time::sleep(time::Duration::from_millis(100)).await;

            let mut client = Client::connect("http://[::1]:50051".to_string())
                .await
                .unwrap();

            let _res = client.delete_subscription("sub_1").await;
        });
        let mut stream = client.streaming_pull(sub_1).await.unwrap();
        // Don't wait
        while let Some(_msg) = stream.next().await {}

        let _res = jh.await.unwrap();

        // close 
        let res = client.close().await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn context_test() {
        let service = PubsubService::new();
        let topic_1 = "topic_1";
        let sub_1 = "sub_1";
        let sub_2 = "sub_2";

        
        // create topic
        service.ctx.create_topic(topic_1).await;
        assert_eq!(
            service.ctx.topics.read().await.get(topic_1).unwrap().len(),
            0
        );

        let res = service.ctx.get_topics().await;
        assert_eq!(res.len(), 1);

        // create subscription
        let _res = service.ctx.create_subscription(topic_1, sub_1).await;
        assert_eq!(
            service.ctx.topics.read().await.get(topic_1).unwrap().len(),
            1
        );
        assert!(service.ctx.subscriptions.read().await.get(sub_1).is_some());

        let _res = service.ctx.create_subscription(topic_1, sub_2).await;
        assert_eq!(
            service.ctx.topics.read().await.get(topic_1).unwrap().len(),
            2
        );

        // publish message
        for i in 0..2 as i32 {
            let message = rpc::PubsubMessage {
                timestamp: 0,
                data: format!("Hello {}", i).as_bytes().to_owned(),
            };
            let _res = service.ctx.publish(topic_1, message).await;
        }

        for i in 0..2 as i32 {
            // for sub_1
            let message = service.ctx.pull(sub_1).await.unwrap().unwrap();
            let word = std::str::from_utf8(&message.data).unwrap();
            assert_eq!(word, format!("Hello {}", i));
            // for sub_2
            let message = service.ctx.pull(sub_2).await.unwrap().unwrap();
            let word = std::str::from_utf8(&message.data).unwrap();
            assert_eq!(word, format!("Hello {}", i));
        }

        // invalid subscription
        let message = service.ctx.pull("sub_3").await;
        assert!(message.is_err());

        // delete subscription
        service.ctx.delete_subscription(sub_2).await;
        assert_eq!(
            service.ctx.topics.read().await.get(topic_1).unwrap().len(),
            1
        );
        assert!(service.ctx.subscriptions.read().await.get(sub_2).is_none());
    }
}
