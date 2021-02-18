use tokio::sync::{mpsc, Mutex, Notify, RwLock};
use tokio_stream;
pub use tonic::{Request, Response, Status};

/*
pub mod rpc {
    include!("../proto/pubsub.rs");
}
*/
#[path="../proto/pubsub.rs"] pub mod rpc;



use rpc::pubsub_server::Pubsub;
use rpc::pubsub_client::PubsubClient;

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use uuid::Uuid;

use futures::stream::StreamExt;

#[tonic::async_trait]
impl Pubsub for PubsubService {
    async fn create_topic(
        &self,
        request: Request<rpc::Topic>,
    ) -> Result<Response<rpc::Topic>, tonic::Status> {
        println!("Got a request: {:?}", request);

        let topic = request.into_inner();

        self.ctx.create_topic(&topic.name).await;

        Ok(Response::new(topic))
    }

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
            Err(e) => Err(Status::new(tonic::Code::AlreadyExists, e)),
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

        self.ctx.publish(&req.topic, req.message.unwrap()).await;

        Ok(Response::new(rpc::PublishResponse {
            message_id: Uuid::new_v4().to_hyphenated().to_string(),
        }))
    }

    async fn pull(
        &self,
        request: Request<rpc::PullRequest>,
    ) -> Result<Response<rpc::PullResponse>, Status> {
        //println!("Got a request: {:?}", request);

        let req = request.into_inner();

        let data = self.ctx.pull(&req.subscription).await;

        Ok(Response::new(rpc::PullResponse { message: data }))
    }

    type StreamingPullStream =
        tokio_stream::wrappers::ReceiverStream<Result<rpc::StreamingPullResponse, Status>>;

    async fn streaming_pull(
        &self,
        request: Request<rpc::StreamingPullRequest>,
    ) -> Result<Response<Self::StreamingPullStream>, Status> {
        //println!("Got a request: {:?}", request);
        let (tx, rx) = mpsc::channel(10);

        let req = request.into_inner();
        let ctx = Arc::clone(&self.ctx);
        tokio::spawn(async move {

            loop {
                let data = ctx.pull(&req.subscription).await;

                if data.is_none() {
                    // data is none when
                    // - subscription.detached is true
                    // - subscription id is not correct
                    break;
                } else {
                    let response = rpc::StreamingPullResponse { message: data };
                    let _res = tx.send(Ok(response)).await.or_else(|err| {
                        eprintln!("StreamingPull: Send Err");
                        Err(err)
                    });
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

    pub async fn create_topic(&self, topic_id: &str) {
        self.topics
            .write()
            .await
            .entry(topic_id.to_string())
            .or_default();
    }

    pub async fn create_topic_with_subscription_id(&self, topic_id: &str, sub_id: &str) {
        self.topics
            .write()
            .await
            .entry(topic_id.to_string())
            .or_default()
            .insert(sub_id.to_string());

    }

    pub async fn get_topics(&self) -> Vec<String> {
        self.topics.read().await.keys().map(|x| x.clone()).collect()
    }

    pub async fn create_subscription(
        &self,
        topic_id: &str,
        subscription_id: &str,
    ) -> Result<(), String> {
        if self
            .subscriptions
            .read()
            .await
            .contains_key(subscription_id)
        {
            return Err("ALREADY_EXISTS".to_string());
        }

        let sub = Arc::new(Subscription {
            topic: topic_id.to_string(),
            messages: Mutex::new(VecDeque::new()),
            notify: Notify::new(),
            detached: RwLock::new(false),
        });

        self.subscriptions
            .write()
            .await
            .insert(subscription_id.to_string(), sub);

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
    }

    pub async fn publish(&self, topic_id: &str, message: rpc::PubsubMessage) {
        let sub_ids = if let Some(sub_ids) = self.topics.read().await.get(topic_id) {
            sub_ids.to_owned().into_iter().collect::<Vec<String>>()
        } else {
            return;
        };

        for id in &sub_ids {
            let sub = if let Some(sub) = self.subscriptions.read().await.get(id){
                sub.clone()
            } else {
                continue;
            };

            let mut messages = sub.messages.lock().await;
            if messages.len() > 10 {
                continue;
            }

            messages.push_back(message.clone());
            sub.notify.notify_one();
        }
    }

    pub async fn pull(&self, subscription_id: &str) -> Option<rpc::PubsubMessage> {
        let sub = match self.subscriptions.read().await.get(subscription_id) {
            Some(sub) => Arc::clone(sub),
            None => return None,
        }; // subscription unlock. Don't whole lock while pulling!

        loop {
            if *sub.detached.read().await {
                return None;
            }

            if let Some(message) = sub.messages.lock().await.pop_front() {
                return Some(message);
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
                        .add_service(rpc::pubsub_server::PubsubServer::new(service))
                        .serve(addr)
                        .await
                        .expect("Error: Start grpc server");

        });
    }
}

pub struct Client {
    client: PubsubClient<tonic::transport::Channel>,
}

impl Client {
    pub async fn connect(address: String) -> Result<Client, tonic::transport::Error> {
        let client = PubsubClient::connect(address).await?;

        Ok(Self{ client })
    }

    pub async fn create_topic(&mut self, name: String) -> Result<(), tonic::Status>{
        // create topic
        let request = Request::new(rpc::Topic {
            name: name,
        });
        
        // create topic
        self.client.create_topic(request).await?;
        Ok(())
    }

    pub async fn create_subscription(&mut self, topic: String, name: String) -> Result<(), tonic::Status> {
        // create subscription
        let request = Request::new(rpc::Subscription {
            name: name,
            topic: topic,
        });

        self.client.create_subscription(request).await?;
        Ok(())
    } 

    pub async fn delete_subscription(&mut self, name: String) -> Result<(), tonic::Status> {
        // delete subscription
        let request = Request::new(rpc::DeleteSubscriptionRequest {
            name: name,
        });

        self.client.delete_subscription(request).await?;
        Ok(())
    } 

    pub async fn publish(&mut self, topic: String, message: rpc::PubsubMessage) -> Result<(), tonic::Status> {
        let request = Request::new(rpc::PublishRequest {
            topic: topic,
            message: Some(message)
        });

        self.client.publish(request).await?;
        Ok(())
    }


    pub async fn pull(&mut self, subscription: String) -> Result<Option<rpc::PubsubMessage>, tonic::Status>{
        let request = Request::new(rpc::PullRequest {
            subscription: subscription,
        });

        let res = self.client.pull(request).await?;
        Ok(res.into_inner().message)
    }

    pub async fn streaming_pull(&mut self, subscription: String) -> Result<tonic::codec::Streaming<rpc::StreamingPullResponse>, tonic::Status>{
        let request = Request::new(rpc::StreamingPullRequest {
            subscription: subscription
        });
        
        let res =self.client.streaming_pull(request).await?;
        Ok(res.into_inner())
    }

    pub async fn subscribe<F>(&mut self, subscription: String, mut callback: F) -> Result<(), tonic::Status> 
    where
        F: FnMut(rpc::PubsubMessage) + Send + 'static
    {
        let request = Request::new(rpc::StreamingPullRequest {
            subscription: subscription
        });

        let mut stream = self.client.streaming_pull(request).await?.into_inner();

        let _jh = tokio::spawn(async move {
            while let Some(stream) = stream.next().await {
                if stream.is_err(){
                    continue;
                }

                if let Some(message) = stream.unwrap().message {
                    callback(message);
                }
            }
        });

        Ok(())
    }
}


#[cfg(test)]
mod tests {
    use super::*;
    use rpc::pubsub_client::PubsubClient;
    use rpc::pubsub_server::PubsubServer;
    use std::time;
    use tonic::{transport::Server, Request};

    //#[tokio::test]
    #[tokio::test(flavor = "multi_thread", worker_threads = 12)]
    async fn grpc_test() {
        let addr = "[::1]:50051".parse().unwrap();
        let pubsub_service = PubsubService::new();

        let _jh = tokio::spawn(async move {
            Server::builder()
                .add_service(PubsubServer::new(pubsub_service))
                .serve(addr)
                .await
                .unwrap();
        });

        tokio::time::sleep(time::Duration::from_millis(100)).await;

        let mut client = PubsubClient::connect("http://[::1]:50051").await.unwrap();

        let topic_1 = "topic_1";
        let sub_1 = "sub_1";

        // create topic
        let request = Request::new(rpc::Topic {
            name: topic_1.to_string(),
        });

        // create topic
        let _res = client.create_topic(request).await.unwrap();
        //println!("RESPONSE={:?}", response);

        // create subscription
        let request = Request::new(rpc::Subscription {
            name: sub_1.to_string(),
            topic: topic_1.to_string(),
        });
        let _res = client.create_subscription(request).await.unwrap();
        //println!("RESPONSE={:?}", response);

        // create same subscription
        let request = Request::new(rpc::Subscription {
            name: sub_1.to_string(),
            topic: topic_1.to_string(),
        });
        let res = client.create_subscription(request).await;
        assert!(res.is_err());
        assert_eq!(tonic::Code::AlreadyExists, res.unwrap_err().code());

        // publish thread
        let jh = tokio::spawn(async {
            let mut client = PubsubClient::connect("http://[::1]:50051").await.unwrap();

            let request = Request::new(rpc::PublishRequest {
                topic: "topic_1".to_string(),
                message: Some(rpc::PubSubMessage {
                    data: "Hello World".as_bytes().to_owned(),
                }),
            });

            let _res = client.publish(request).await.unwrap();
            //println!("RESPONSE={:?}", response);
            tokio::time::sleep(time::Duration::from_millis(500)).await;
        });

        // pull
        let request = Request::new(rpc::PullRequest {
            subscription: sub_1.to_string(),
        });
        let _res = client.pull(request).await.unwrap();
        //println!("RESPONSE={:?}", response);

        jh.await.unwrap();

        // streaming_pull
        let jh = tokio::spawn(async {
            let mut client = PubsubClient::connect("http://[::1]:50051").await.unwrap();
            for i in 0..10 as i32 {
                let request = Request::new(rpc::PublishRequest {
                    topic: "topic_1".to_string(),
                    message: Some(rpc::PubSubMessage {
                        data: format!("Hello World {}", i).as_bytes().to_owned(),
                    }),
                });
                let _res = client.publish(request).await.unwrap();
                //println!("RESPONSE={:?}", response);
            }

            tokio::time::sleep(time::Duration::from_millis(500)).await;

            // delete subscription
            let request = Request::new(rpc::DeleteSubscriptionRequest {
                name: "sub_1".to_string(),
            });
            let _res = client.delete_subscription(request).await.unwrap();
            //println!("RESPONSE={:?}", response);
        });

        let request = Request::new(rpc::StreamingPullRequest {
            subscription: sub_1.to_string(),
        });
        let mut response = client.streaming_pull(request).await.unwrap().into_inner();
        //println!("RESPONSE={:?}", response);
        //while let Some(message) = response.message().await.unwrap() {
        while let Some(message) = response.next().await {
            let _res = message.and_then(|res| {
                match &res.message {
                    Some(message) => {
                        println!(
                            "STREAM RECV: {:?}",
                            std::str::from_utf8(&message.data).unwrap()
                        );
                    },
                    None => {}
                }
                Ok(res)
            })
            .or_else(|e| {
                println!("Err: Streaming");
                Err(e)
            });
        }

        jh.await.unwrap();
    }

    #[tokio::test]
    async fn simple_test() {
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
            let message = rpc::PubSubMessage {
                data: format!("Hello {}", i).as_bytes().to_owned(),
            };
            service.ctx.publish(topic_1, message).await;
        }

        for i in 0..2 as i32 {
            // for sub_1
            let message = service.ctx.pull(sub_1).await.unwrap();
            let word = std::str::from_utf8(&message.data).unwrap();
            assert_eq!(word, format!("Hello {}", i));
            // for sub_2
            let message = service.ctx.pull(sub_2).await.unwrap();
            let word = std::str::from_utf8(&message.data).unwrap();
            assert_eq!(word, format!("Hello {}", i));
        }

        // invalid subscription
        let message = service.ctx.pull("sub_3").await;
        assert!(message.is_none());

        // delete subscription
        service.ctx.delete_subscription(sub_2).await;
        assert_eq!(
            service.ctx.topics.read().await.get(topic_1).unwrap().len(),
            1
        );
        assert!(service.ctx.subscriptions.read().await.get(sub_2).is_none());
    }

    #[tokio::test]
    async fn service_threading() {
        let pubsub_service = Arc::new(PubsubService::new());

        let mut handles = vec![];
        for i in 0..10 as i32 {
            let service = Arc::clone(&pubsub_service);
            let jh = tokio::spawn(async move {
                let topic = "topic_1";
                let sub = format!("sub_{}", i);
                service.ctx.create_topic(&topic).await;
                let _res = service.ctx.create_subscription(topic, &sub).await;

                tokio::time::sleep(time::Duration::from_millis(100)).await;
                let message = service.ctx.pull(&sub).await.unwrap();
                let word = std::str::from_utf8(&message.data).unwrap();
                println!("{} :{}", i, word);
            });
            handles.push(jh);
        }

        tokio::time::sleep(time::Duration::from_millis(30)).await;
        for i in 0..3 as i32 {
            let message = rpc::PubSubMessage {
                data: format!("Hello {}", i).as_bytes().to_owned(),
            };
            pubsub_service.ctx.publish("topic_1", message).await;
        }

        for handle in handles {
            let _res = handle.await.unwrap();
        }

        for topic in pubsub_service.ctx.get_topics().await {
            println!("topic: {}", topic);
        }
    }
}
