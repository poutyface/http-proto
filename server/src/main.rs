use actix::prelude::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self};
use actix_web::{App, Error, HttpRequest, HttpResponse, HttpServer, Result, web};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use protobuf::Message as _;
use protobuf::well_known_types::Any;
use serde_json::{self, json};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use std::time;
use pubsub::pubsub_service;

mod pubsub_message_provider;
use pubsub_message_provider::PubsubMessageProvider;

mod api;
#[path = "../../service/status/proto/status.rs"]
mod service_status;


macro_rules! ws_response_stream {
    ($name: expr, $subject: expr, $start_time: expr, $end_time: expr, $items: expr) => {
        {
            let mut stream = api::proto::response::Stream::new();
            stream.set_path($name.to_string());
            stream.set_subject($subject.to_string());
            stream.set_start_time($start_time);
            stream.set_end_time($end_time);
            stream.set_items($items.into());
            
            let mut res = api::proto::response::WSResponse::new();
            res.set_path($name.to_string());
            res.set_data(Any::pack(&stream).unwrap());
            res
        };
    };
}



impl api::proto::response::WSResponse {
    fn send<A>(self, ctx: &mut ws::WebsocketContext<A>)
    where 
        A: Actor<Context = ws::WebsocketContext<A>>
    {
        let _res = self
            .write_to_bytes()
            .map(|msg| ctx.binary(msg))
            .map_err(|e| eprintln!("send error {:?}", e));
    }
}


pub struct WebsocketGateway {
    route: HashMap<String, Box<dyn WebsocketResponder>> 
}

impl WebsocketGateway
{
    pub fn new() -> Self {
        Self { 
            route: HashMap::new()
         }
    }

    pub fn register(&mut self, responder: Box<dyn WebsocketResponder>) {
        self.route.insert(responder.name(), responder);
    }


    fn dispatch(
        &mut self,
        msg: Result<ws::Message, ws::ProtocolError>,
        ctx: &mut ws::WebsocketContext<Self>,
    ) {
        match msg {
            Ok(ws::Message::Text(text)) => {
                let json_value: serde_json::Result<serde_json::Value> = serde_json::from_str(&text);

                let _ = json_value.map(|params| {
                    params["header"]["path"].as_str().map(|path| {
                        let scope = path.split('/').collect::<Vec<&str>>()[0];
                        println!("Scope: {}", scope);
                        let responder = self.route.get_mut(scope);
                        responder.map(|responder| {
                            responder.execute(&params ,ctx);
                        });

                    });
                });
            }
            Ok(ws::Message::Close(_)) => {
                println!("Client websocket closed");

                for (_, responder) in self.route.iter_mut() {
                    responder.close(ctx);
                }

                ctx.stop();
            }
            Err(e) => {
                eprintln!("Err: WsHandler received message error {:?}", e);
            }
            _ => {
                eprintln!("Warning: Unsupported message");
            }
        }
    }
}

#[allow(unused_variables)]
impl Actor for WebsocketGateway {
    type Context = ws::WebsocketContext<Self>;

    // #[TODO]
    fn started(&mut self, ctx: &mut Self::Context){
    }

    // #[TODO]
    fn stopped(&mut self, ctx: &mut Self::Context) {
    }

}

#[derive(Message)]
#[rtype(result = "()")]
pub struct SendWSResponse {
    response: api::proto::response::WSResponse,
}


impl Handler<SendWSResponse> for WebsocketGateway {
    type Result = ();

    fn handle(&mut self, msg: SendWSResponse, ctx: &mut Self::Context) {
        msg.response.send(ctx);
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebsocketGateway
{
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        self.dispatch(msg, ctx);
    }
}


#[allow(unused_variables)]
pub trait WebsocketResponder {
 
    fn name(&self) -> String;

    fn execute(
        &mut self,
        params: &serde_json::Value,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>);


    // when websocket closed
    fn close(
        &mut self,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>){}
}


pub struct CommandService{
    pubsub: Arc<RwLock<pubsub_service::Client>>,
    message_provider: Arc<RwLock<PubsubMessageProvider>>, 
}

impl CommandService{
    async fn new(pubsub_address: String, message_provider: Arc<RwLock<PubsubMessageProvider>>) -> Self {
        let pubsub = Arc::new(RwLock::new(
            pubsub_service::Client::connect(pubsub_address)
                .await
                .unwrap(),
        ));

        Self {
            pubsub,
            message_provider
        }
    }
}

impl WebsocketResponder for CommandService {

    fn name(&self) -> String {
        "Command".into()
    }

    fn execute(
        &mut self,
        params: &serde_json::Value,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>
    ) {
        match params["header"]["path"].as_str() {
            Some("Command/Test") => {
                println!("Receive Command/Test");
            }
            Some("Command/Record") => {
                let enable: bool = params["enable"].as_bool().unwrap_or(false);
                println!("Command/Record {}", enable);
                self.message_provider.read().unwrap().enable_record(enable);
            }
            _ => {}
        }
    }

    fn close(
        &mut self,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>
    ){
        let pubsub = self.pubsub.clone();
        let task = async move {
            let _res = pubsub.write().unwrap().close().await;
        };
        let task = actix::fut::wrap_future(task);
        ctx.wait(task);
    }
}


pub struct StatusService {
    message_provider: Arc<RwLock<PubsubMessageProvider>>, 
    live: bool
}

impl StatusService {
    async fn new(message_provider: Arc<RwLock<PubsubMessageProvider>>) -> Result<Self, String> {
        Ok(Self {
            message_provider,
            live: true,
        })
    }

    pub fn enable_live(&mut self, enable: bool){
        self.live = enable;
    }

    fn get_message(&self, topic: &str, timestamp: Option<u64>) -> Option<pubsub::proto::pubsub::PubsubMessage>{
        self.message_provider.read().unwrap().get(topic, timestamp)
    }
} 


impl WebsocketResponder for StatusService {

    fn name(&self) -> String {
        "Status".into()
    }

    fn execute(
        &mut self,
        params: &serde_json::Value,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>
    ) {
        let start_time: u64 = params["start_time"].as_u64().unwrap_or(0);
        let end_time: u64 = params["end_time"].as_u64().unwrap_or(0);

            
        let timestamps = if self.live {
            // one shot
            vec![end_time]
        } else {
            self.message_provider.read().unwrap().collect_timestamps("status/status", start_time, end_time)
        };

        match params["header"]["path"].as_str() {
            Some("Status/type1") => {
                let message = json!({
                    "path": "Status/type1",
                    "data": {
                        "path": "Status/type1",
                        "subject": "/status/type1",
                        "start_time": start_time,
                        "end_time": end_time,
                        "items": [
                            {
                                "timestamp": end_time,
                                "name": "hello world",
                            },  
                        ],
                    },
                });
                ctx.text(message.to_string())
            }
            Some("Status/Live") => {
                let enable: bool = params["enable"].as_bool().unwrap_or(false);
                println!("Status/Live {}", enable);
                self.enable_live(enable);
            }
            Some("Status/Status") => {
                let mut items = Vec::new();
            
                for timestamp in timestamps {

                    let timestamp = (!self.live).then(|| timestamp);
                    let message = self.get_message("/status/status", timestamp);
                    let _ = message.map(|msg| {
                        // convert PubsubMessage.data to Status proto
                        let res: protobuf::ProtobufResult<service_status::Status> =
                            protobuf::Message::parse_from_bytes(&msg.data);

                        if let Ok(data) = res {                   
                            let mut status = api::proto::response::Status::new();
    
                            // Position
                            let mut point3d = api::proto::primitives::Point3d::new();
                            let pos = data.position.unwrap();
                            point3d.set_x(pos.x);
                            point3d.set_y(pos.y);
                            point3d.set_z(pos.z);
                            status.set_point3d(point3d);
    
                            // debug
                            let mut text = api::proto::primitives::Text::new();
                            text.set_text(data.debug);
                            status.set_text(text);
    
                            // chart
                            let mut point2d = api::proto::primitives::Point2d::new();
                            point2d.set_x(data.timestamp as f32);
                            point2d.set_y(pos.y as f32);
                            status.set_point2d(point2d);
    
                            let mut streamset = api::proto::response::StreamSet::new();
                            streamset.set_timestamp(data.timestamp);
                            streamset.set_status(status);
                            items.push(streamset);
                        }
                    });
                }
                ws_response_stream!("Status/Status", "/status/status", start_time, end_time, items).send(ctx);

            }
            Some("Status/Debug") => {
                let mut items = Vec::new();
                for timestamp in timestamps {
                    let timestamp = (!self.live).then(|| timestamp);

                    let message = self.get_message("/status/status", timestamp);
                    let _ = message.map(|msg| {
                        // convert PubsubMessage.data to Status proto
                        let res: protobuf::ProtobufResult<service_status::Status> =
                            protobuf::Message::parse_from_bytes(&msg.data);

                        if let Ok(data) = res {
                            let mut debug = api::proto::primitives::Text::new();
                            debug.set_text(data.debug);

                            let mut streamset = api::proto::response::StreamSet::new();
                            streamset.set_timestamp(data.timestamp);
                            streamset.set_text(debug);
                            items.push(streamset);
                        }
                    });
                }
                ws_response_stream!("Status/Debug", "/status/debug", start_time, end_time, items).send(ctx);
            }
            _ => {
                return;
            }
        }
    }

}

async fn ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {

    // create services
    let status_service = match  StatusService::new(state.message_provider.clone()).await {
        Ok(status_service) => status_service,
        Err(err) => {
            println!("{}", err);
            return Err(actix_web::error::ErrorServiceUnavailable(err));
        }
    };

    let command_service = 
        CommandService::new(
            state.pubsub_address.clone(),
            state.message_provider.clone()
        ).await;
    
    // register services
    let mut gateway = WebsocketGateway::new();
    gateway.register(Box::new(status_service));
    gateway.register(Box::new(command_service));

    let resp = ws::start(gateway, &req, stream);
    
    println!("/ws accept: {:?}", resp);
    resp
}


pub struct Image {
    data: Option<image::DynamicImage>,
}

impl Image {
    pub fn new(path: String) -> Self {
        let reader = image::io::Reader::open(path);
        let image = reader.ok().and_then(|reader| reader.decode().ok());
        Self { data: image }
    }

    pub fn resize(mut self, scale_width: f64, scale_height: f64) -> Self {
        self.data = self.data.map(|image| {
            let width = (scale_width * image.width() as f64) as u32;
            let height = (scale_height * image.height() as f64) as u32;
            image.resize(width, height, image::imageops::FilterType::Nearest)
        });

        self
    }
}

pub struct ImageService {
    message_provider: Arc<RwLock<PubsubMessageProvider>>,
    spawn_handle: HashMap<String, actix::SpawnHandle>,
}

impl ImageService {
    // Local dicrectory
    pub fn prepare_image_proto(resource_name: &str, timestamp: u64, scale_x: f64, scale_y: f64)
    -> Option<api::proto::primitives::Image> {
        // FIXME!!!!!!
        let image = Image::new(format!(
            "./backend/assets/{}/{}.jpg",
            resource_name, timestamp
        ))
        .resize(scale_x, scale_y);

        // To proto
        let mut bytes: Vec<u8> = Vec::new();
        if let Some(image) = image.data {
            let res = image.write_to(&mut bytes, image::ImageOutputFormat::Jpeg(70));
            if res.is_err() {
                return None;
            }
        } else {
            return None;
        }

        let mut image_proto = api::proto::primitives::Image::new();
        image_proto.set_data(bytes);
        image_proto.set_mime_type("image/jpeg".into());
        Some(image_proto)
    }

    pub fn prepare_image_proto_from_imagedata(
        message_provider: &Arc<RwLock<PubsubMessageProvider>>, 
        resource_name: &str,
        timestamp: Option<u64>,
        scale_x: f64,
        scale_y: f64)
    -> Option<api::proto::primitives::Image>
    {

        let message = { 
            message_provider.read().unwrap().get(resource_name, timestamp)
        };

        let image = 
            message.ok_or_else(|| {
                format!("Error: Not Found {} {:?}", resource_name, timestamp)
            })
            .and_then(|message| {
                let image: protobuf::ProtobufResult<api::proto::primitives::Image> = 
                    protobuf::Message::parse_from_bytes(&message.data);
                image.map_err(|err| err.to_string())
            });
        
        let dyn_image = 
            image.and_then(|image| {
                image::io::Reader::new(std::io::Cursor::new(image.data)).with_guessed_format()
                .map_err(|err| { err.to_string() })
                .and_then(|reader| {
                    reader.decode().map_err(|_err| "decode error".to_string())
                })
            });

        let res = 
            dyn_image.and_then(|image| {
                let width = (scale_x * image.width() as f64) as u32;
                let height = (scale_y * image.height() as f64) as u32;
                let image = image.resize(width, height, image::imageops::FilterType::Nearest);
                let mut bytes: Vec<u8> = Vec::new();
                image.write_to(&mut bytes, image::ImageOutputFormat::Jpeg(70))
                    .map_err(|err| err.to_string())
                    .and_then(|_| {
                        let mut image_proto = api::proto::primitives::Image::new();                    
                        image_proto.set_data(bytes);
                        image_proto.set_mime_type("image/jpeg".into());
                        Ok(image_proto)        
                    })               
            });

        
        match res {
            Ok(image_proto) => Some(image_proto),
            Err(err) => {
                println!("{}", err);
                None
            }
        }
    }

    pub fn build_streamset(
        timestamp: u64,
        image_proto: api::proto::primitives::Image)
     -> api::proto::response::StreamSet
    {
        let mut streamset = api::proto::response::StreamSet::new();
        streamset.set_timestamp(timestamp);
        streamset.set_image(image_proto);
        return streamset;
    }
}

impl WebsocketResponder for ImageService {

    fn name(&self) -> String {
        "Image".into()
    }

    fn execute(
        &mut self,
        params: &serde_json::Value,
        ctx: &mut ws::WebsocketContext<WebsocketGateway>,
    ) {
        let scale_x: f64 = params["scale_x"].as_f64().unwrap_or(1.0);
        let scale_y: f64 = params["scale_y"].as_f64().unwrap_or(1.0);
        let start_time: u64 = params["start_time"].as_u64().unwrap_or(0);
        let end_time: u64 = params["end_time"].as_u64().unwrap_or(0);
        let resource_name = params["resource"].as_str().unwrap_or("").to_owned();
        /*  
        println!(
            "resource:{} time:{}, {} scale:{}, {}",
            &resource_name, start_time, end_time, scale_x, scale_y
        );
        */
        match params["header"]["path"].as_str() {
            Some("Image/Image") => {
                let mut items = Vec::new();

                let timestamps = {
                    self.message_provider.read().unwrap().collect_timestamps(&resource_name, start_time, end_time)
                };

                for timestamp in timestamps{
                    println!("timestamp: {}", timestamp);
                    //if let Some(image_proto) = Self::prepare_image_proto(&resource_name, timestamp, scale_x, scale_y) {
                    if let Some(image_proto) 
                        = Self::prepare_image_proto_from_imagedata(&self.message_provider, &resource_name, Some(timestamp), scale_x, scale_y) {
                        items.push(Self::build_streamset(timestamp,image_proto));
                    }
                }
                
                ws_response_stream!("Image/Image", &resource_name, start_time, end_time, items).send(ctx);
            }
            Some("Image/StopStreamImage") => {
                let _ = params["client_id"].as_str().map(|client_id| {
                    self.spawn_handle.get(client_id).map(|handle| {
                        ctx.cancel_future(*handle);
                    });
                    self.spawn_handle.remove(client_id);
                });
            }
            Some("Image/StreamImage") => {
                let client_id = if let Some(client_id) = params["client_id"].as_str(){
                    client_id
                } else{
                    return;
                };
                
                if let Some(_) = self.spawn_handle.get(client_id) {
                    println!("Already streaming.");
                    return;
                }

                let mut timestamps = {
                    self.message_provider.read().unwrap().collect_all_timestamps(&resource_name)
                };

                timestamps.reverse();

                timestamps = timestamps.into_iter().filter(|&x| x >= start_time).collect::<Vec<_>>();

                // Give up to use run_interval, Because dev mode is too slow. 
                // run_interval function takes time more than 33 msec, then other actor future is not assigned to call
                let task = {
                    let recipient = ctx.address().recipient();
                    let message_provider = self.message_provider.clone();
                    let mut start_time = std::time::Instant::now();
                    async move {
                        loop{
                            let elapsed = start_time.elapsed();
                            let dur = elapsed.as_millis();
                            println!("Duration: {:?}", dur);
                            // 1msec: for switting to other task
                            let mut sleep_time = 1; 
                            if dur < 33 {
                                sleep_time = 33 - dur as u64;
                            }
                            let _ = tokio::time::sleep(time::Duration::from_millis(sleep_time)).await;
                            
                            start_time = std::time::Instant::now();
                            
                            let mut items = Vec::new();
                            let timestamp = if let Some(timestamp) = timestamps.pop() {
                                timestamp
                            } else {
                                break;
                            };                     

                            if let Some(image_proto) = 
                                Self::prepare_image_proto_from_imagedata(&message_provider, &resource_name, Some(timestamp), scale_x, scale_y){
                                items.push(Self::build_streamset(timestamp, image_proto));
                            }

                            let response = ws_response_stream!("Image/StreamImage", &resource_name, timestamp, timestamp, items);
                            let _ = recipient.do_send(SendWSResponse { response });            
                        }
                    }
                };
                let task = actix::fut::wrap_future(task);
                let handle = ctx.spawn(task);
                self.spawn_handle.insert(client_id.into(), handle);
            }
            _ => (),
        }
    }
}


async fn image_service(req: HttpRequest, stream: web::Payload, state: web::Data<AppState>) -> Result<HttpResponse, Error> {
    // create services
    let image_service = ImageService{
        message_provider: state.message_provider.clone(), 
        spawn_handle: HashMap::new()
     };
    
    // register services
    let mut gateway = WebsocketGateway::new();
    gateway.register(Box::new(image_service));

    let resp = ws::start(gateway, &req, stream);

    println!("ImageService connect request: {:?}", req);
    resp
}

pub struct AppState {
    pubsub_address: String,
    message_provider: Arc<RwLock<PubsubMessageProvider>>,
}

impl AppState {
    pub async fn new(pubsub_address: String) -> Result<Self, String> {
        let message_provider = PubsubMessageProvider::new(
            pubsub_address.clone(),
            vec![
                "/status/status".into(),
                "/status/image".into(),
            ])
            .await.unwrap();


        Ok(Self{
            pubsub_address,
            message_provider: Arc::new(RwLock::new(message_provider)),
        })
    }

    pub async fn destroy(&self){
        self.message_provider.write().unwrap().close().await;
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    const SERVER_ADDRESS: &str = "127.0.0.1:4567";
    const PUBSUB_ADDRESS: &str = "[::1]:50051";

    // PubSub Server
    pubsub_service::Server::start(PUBSUB_ADDRESS);
    // nop to send response
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let state = 
        web::Data::new(AppState::new(format!("{}{}", "http://", PUBSUB_ADDRESS)).await.unwrap());


    // Start server
    let _res = HttpServer::new({
        let state = state.clone();
        move || {
            App::new()
                .app_data(state.clone())
                .route("/ws", web::get().to(ws))
                .route("/image_service", web::get().to(image_service))
                .service(actix_files::Files::new("/", "./web/dist").show_files_listing())
        }
    })
    .bind(SERVER_ADDRESS)?
    .run()
    .await;

    state.destroy().await;

    Ok(())
}
