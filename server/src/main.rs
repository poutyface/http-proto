use actix::prelude::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self};
use actix_web::{App, Error, HttpRequest, HttpResponse, HttpServer, Result, web};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use protobuf::Message;
use serde_json::{self, json};
use std::{collections::{HashMap, VecDeque}, io::Write};
use std::sync::{Arc, RwLock, Mutex};
use uuid::Uuid;
use pubsub::pubsub_service;

mod api;
#[path = "../../service/status/proto/status.rs"]
mod service_status;

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


macro_rules! ws_response {
    ($name: expr, $setter: ident, $data: expr, $timestamp: expr) => {
        {
            let mut res = api::proto::message::WSResponse::new();
            res.set_field_type($name.to_string());
            res.set_timestamp($timestamp);
            res.$setter($data);
            res
        };
    };
}

impl api::proto::message::WSResponse {
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
                let params = if let Ok(value) = json_value {
                    value
                } else {
                    return;
                };

                if let Some(msg_type) = params["type"].as_str() {
                    let scope = msg_type.split('/').collect::<Vec<&str>>()[0];
                    println!("scope: {}", scope);
                    if let Some(responder) = self.route.get_mut(scope) {
                        responder.execute(&params, ctx);
                    }
                }

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

impl Actor for WebsocketGateway {
    type Context = ws::WebsocketContext<Self>;

    // #[TODO]
    fn started(&mut self, ctx: &mut Self::Context){
    }

    // #[TODO]
    fn stopped(&mut self, ctx: &mut Self::Context) {
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
    pubsub: Arc<RwLock<pubsub_service::Client>>
}

impl CommandService{
    async fn new(pubsub_address: String) -> Self {
        let pubsub = Arc::new(RwLock::new(
            pubsub_service::Client::connect(pubsub_address)
                .await
                .unwrap(),
        ));

        Self {
            pubsub
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
        match params["type"].as_str() {
            Some("Command/Test") => {
                println!("Receive Command/Test");
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
        }.actfuture();

        ctx.wait(task);
    }
}


pub struct StatusService {
    //pubsub: Arc<RwLock<pubsub_service::Client>>,
    status: Arc<Mutex<StatusProvider>>,
    realtime: bool
}

impl StatusService {

    async fn new(status_provider: Arc<Mutex<StatusProvider>>) -> Result<Self, String> {
        Ok(Self {
            realtime: true,
            status: status_provider
        })
    }

    pub fn enable_realtime(&mut self, enable: bool){
        self.realtime = enable;
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
        let timestamp: u64 = params["fields"]["timestamp"].as_u64().unwrap_or(0);
        let timestamp = if self.realtime {
            None
        } else {
            Some(timestamp)
        };
        match params["type"].as_str() {
            Some("Status/type1") => {
                let message = json!({
                    "type": "Status/type1",
                    "timestamp": timestamp,
                    "name": "hello world",
                });
                ctx.text(message.to_string())
            }
            Some("Status/Capture") => {
                let enable: bool = params["fields"]["enable"].as_bool().unwrap_or(false);
                println!("Status/Capture {}", enable);
                self.status.lock().unwrap().enable_capture(enable);
            }
            Some("Status/Realtime") => {
                let enable: bool = params["fields"]["enable"].as_bool().unwrap_or(false);
                println!("Status/Realtime {}", enable);
                self.enable_realtime(enable);
            }
            Some("Status/Status") => {
                self.status.lock().unwrap().get_status(timestamp).map(|data| {
                            
                    let mut status = api::proto::message::Status::new();

                    // Position
                    let mut position = api::proto::message::Position32f::new();
                    let pos = data.position.unwrap();
                    position.set_x(pos.x);
                    position.set_y(pos.y);
                    position.set_z(pos.z);
                    status.set_position(position);

                    // debug
                    let mut debug = api::proto::message::Debug::new();
                    debug.set_value(data.debug);
                    status.set_debug(debug);

                    // chart
                    let mut point = api::proto::message::Point2DInt::new();
                    point.set_x(data.timestamp as i64);
                    point.set_y(pos.y as i64);
                    status.set_chartData(point);

                    ws_response!("Status/Status", set_status, status, data.timestamp).send(ctx);
                });
            }
            Some("Status/ChartPosition") => {
                self.status.lock().unwrap().get_status(timestamp).map(|data| {
                    let pos = data.position.unwrap();
                    let mut point = api::proto::message::Point2DInt::new();
                    point.set_x(data.timestamp as i64);
                    point.set_y(pos.y as i64);

                    ws_response!("Status/ChartPosition", set_chartData, point, data.timestamp).send(ctx);
                });
            }
            Some("Status/Position") => {
                self.status.lock().unwrap().get_status(timestamp).map(|data| {
                    // Position
                    let mut position = api::proto::message::Position32f::new();
                    let pos = data.position.unwrap();
                    position.set_x(pos.x);
                    position.set_y(pos.y);
                    position.set_z(pos.z);

                    ws_response!("Status/Position", set_position, position, data.timestamp).send(ctx);
                });
            }
            Some("Status/Debug") => {
                self.status.lock().unwrap().get_status(timestamp).map(|data| {
                    let mut debug = api::proto::message::Debug::new();
                    debug.set_value(data.debug);

                    ws_response!("Status/Debug", set_debug, debug, data.timestamp).send(ctx);
                });
            }
            _ => {
                return;
            }
        }
    }

}


struct StatusProvider {
    pubsub: pubsub_service::Client,
    status: Arc<RwLock<VecDeque<Box<service_status::Status>>>>,
    capture: Arc<RwLock<bool>>,
    capture_path: String,
}

impl StatusProvider {
    pub async fn new(
        pubsub_address: String
    ) -> Result<Self, String> {

        let capture = Arc::new(RwLock::new(false));
        let capture_path = "/tmp/StatusProvider".to_string();
        if !std::path::Path::new(&capture_path).exists() {
            let res = std::fs::create_dir(&capture_path);
            if res.is_err() {
                return Err("StatusProvider: Fail to create /tmp/StatusProvider directory".to_string());
            }
        }

        let mut pubsub = match pubsub_service::Client::connect(pubsub_address).await {
            Ok(client) => client,
            Err(err) => {
                println!("{}", err);
                return Err("Fail to  connect pubusub server".into());
            }
        };

        let sub_id = Uuid::new_v4().to_hyphenated().to_string();
        match pubsub
            .create_subscription("status", &sub_id)
            .await 
        {
            Ok(_) => (),
            Err(e)=> return Err(format!("{}", e))
        }

        let status = Arc::new(RwLock::new(VecDeque::new()));
        let _res = pubsub
            .subscribe(&sub_id, {
                let status = status.clone();
                let capture = capture.clone();
                let capture_path = capture_path.clone();

                move |msg| {
                    let msg = if let Ok(message) = msg {
                        message
                    } else {
                        return;
                    };

                    let message: service_status::Status =
                    protobuf::Message::parse_from_bytes(&msg.data).unwrap();
                    
                    if *capture.read().unwrap() {
                        let path = format!("{}/{}.bytes", capture_path, message.timestamp);

                        let _ = std::fs::File::create(&path).map(|mut file| {
                            let _ = file.write_all(&msg.data);
                            let _ = file.flush();
                        });
                    }
                    
                    println!("timestamp: {}", message.timestamp);
                    let mut values = status.write().unwrap();
                    values.pop_front();
                    values.push_back(Box::new(message));
                }
            })
            .await;

        Ok(Self {
            pubsub,
            status,
            capture,
            capture_path,
        })
    }

    pub async fn close(&mut self){
        let _res = self.pubsub.close().await;
    }

    pub fn enable_capture(&self, enable: bool) {
        *self.capture.write().unwrap() = enable;
    }

    fn fetch(&self, timestamp: Option<u64>) -> Option<service_status::Status>{
        let data = match timestamp {
            None => {
                println!("realtime");
                let values = self.status.read().unwrap();
                if let Some(data) = values.get(0) {
                    data.as_ref().clone()
                } else {
                    println!("empty");
                    return None;
                }
            }
            Some(timestamp) => {
                println!("local");
                match std::fs::File::open(&format!("{}/{}.bytes", &self.capture_path, timestamp)) {
                    Ok(mut file) => {
                        let mut buf = Vec::new();
                        use std::io::Read;
                        let res = file.read_to_end(&mut buf);
                        if res.is_ok() {
                            let message: service_status::Status =
                                protobuf::Message::parse_from_bytes(&buf).unwrap();
                            message
                        } else {
                            return None;
                        }
                    }
                    Err(e) => {
                        println!("empty: {}", e);
                        return None;
                    }
                }
            }
        };

        Some(data)
    }

    pub fn get_status(&self, timestamp: Option<u64>) -> Option<service_status::Status> {
        self.fetch(timestamp)
    }

}


async fn ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {

    // create services
    let status_service = match  StatusService::new(state.status_provider.clone()).await {
        Ok(status_service) => status_service,
        Err(err) => {
            println!("{}", err);
            return Err(actix_web::error::ErrorServiceUnavailable(err));
        }
    };

    let command_service = CommandService::new(state.pubsub_address.clone()).await;
    
    // register services
    let mut gateway = WebsocketGateway::new();
    gateway.register(Box::new(status_service));
    gateway.register(Box::new(command_service));

    let resp = ws::start(gateway, &req, stream);
    
    println!("/ws accept: {:?}", resp);
    resp
}


pub struct ImageService {
    spawn_handle: Option<actix::SpawnHandle>,
}

impl ImageService {
    pub fn prepare_image_proto(&self, resource_name: &str, timestamp: u64, scale_x: f64, scale_y: f64)
    -> Option<api::proto::image::ImageData> {
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

        let mut image_proto = api::proto::image::ImageData::new();
        image_proto.set_image(bytes);
        Some(image_proto)
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
        let scale_x: f64 = params["fields"]["scale_x"].as_f64().unwrap_or(1.0);
        let scale_y: f64 = params["fields"]["scale_y"].as_f64().unwrap_or(1.0);
        let mut timestamp: u64 = params["fields"]["timestamp"].as_u64().unwrap_or(0);
        let resource_name = params["fields"]["resource"].as_str().unwrap_or("").to_owned();
        /*
        println!(
            "resource:{} frame:{} scale:{}, {}",
            resource_name, timestamp, scale_x, scale_y
        );
        */

        match params["type"].as_str() {
            Some("Image/Image") => {
                if let Some(image_proto) = self.prepare_image_proto(&resource_name, timestamp, scale_x, scale_y) {
                    ws_response!("Image/Image", set_image, image_proto, timestamp).send(ctx);
                }
            }
            Some("Image/StopStreamImage") => {
                if let Some(handle) = self.spawn_handle {
                    ctx.cancel_future(handle);
                    self.spawn_handle = None;
                }
            }
            Some("Image/StreamImage") => {
                if let Some(_) = self.spawn_handle {
                    println!("Already streaming.");
                    return;
                }

                let handle =
                    ctx.run_interval(std::time::Duration::from_millis(33), {
                        let mut params = params.clone();
                        let name = self.name();
                        move |actor, ctx| {
                            timestamp += 1;
                            params["type"] = json!("Image/Image");    
                            params["fields"]["timestamp"] = json!(timestamp);
                            let this = actor.route.get_mut(&name).unwrap();
                            this.execute(&params, ctx);
                        }
                    });

                self.spawn_handle = Some(handle);
            }
            _ => (),
        }
    }
}


async fn image_service(req: HttpRequest, stream: web::Payload, state: web::Data<AppState>) -> Result<HttpResponse, Error> {
    // create services
    let image_service = ImageService{ spawn_handle: None };
    
    // register services
    let mut gateway = WebsocketGateway::new();
    gateway.register(Box::new(image_service));

    let resp = ws::start(gateway, &req, stream);

    println!("ImageService connect request: {:?}", req);
    resp
}

pub struct AppState {
    pubsub_address: String,
    status_provider: Arc<Mutex<StatusProvider>>
}

impl AppState {
    pub async fn new(pubsub_address: String) -> Result<Self, String> {

        let status = match StatusProvider::new(pubsub_address.clone()).await {
            Ok(status) => status,
            Err(err) => {
                println!("{}", err);
                return Err("Fail to create StatusProvider".into());
            }
        };

        Ok(Self{
            pubsub_address,
            status_provider: Arc::new(Mutex::new(status))
        })
    }

    pub async fn destroy(&self){
        self.status_provider.lock().unwrap().close().await;
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
