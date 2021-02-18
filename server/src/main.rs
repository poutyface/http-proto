use actix::prelude::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self};
use actix_web::{client::Client, web, App, Error, HttpRequest, HttpResponse, HttpServer, Result};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use protobuf::Message;
use serde_json::{self, json};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, RwLock};
mod pubsub_service;
use pubsub_service::rpc::PubsubMessage;

mod api;
#[path="../../service/status/proto/status.rs"] mod service_status;


pub struct Image {
    data: Option<image::DynamicImage>,
}

impl Image {
    pub fn new(path: String) -> Self {
        let reader = image::io::Reader::open(path);

        let image = reader.ok().and_then(|reader| {
            reader.decode().ok()
        });

        Self { data: image }
    }

    pub fn resize(mut self, scale_width: f64, scale_height: f64) -> Self {
        //if let Some(image) = self.data {
        self.data = self.data.map(|image| {
            let width = (scale_width * image.width() as f64) as u32;
            let height = (scale_height * image.height() as f64) as u32;

            image.resize(width, height, image::imageops::FilterType::Nearest)
        });

        self
    }
}

pub fn send_inbox<A>(inbox: &mut api::proto::message::Inbox, ctx: &mut ws::WebsocketContext<A>)
where
    A: Actor<Context = ws::WebsocketContext<A>>,
{
    if let Ok(msg) = inbox.write_to_bytes() {
        ctx.binary(msg);
    }
}

pub fn create_inbox(type_name: &str, timestamp: u64) -> api::proto::message::Inbox {
    let mut inbox = api::proto::message::Inbox::new();
    inbox.set_field_type(type_name.to_string());
    inbox.set_timestamp(timestamp);
    inbox
}

fn dispatch<A: Actor + ServiceHandler>(
    actor: &mut A,
    msg: Result<ws::Message, ws::ProtocolError>,
    ctx: &mut A::Context,
) {
    match msg {
        Ok(ws::Message::Text(text)) => {
            let json_value: serde_json::Result<serde_json::Value> = serde_json::from_str(&text);
            let request = if json_value.is_ok() {
                json_value.unwrap()
            } else {
                println!("Warning: failt to decode json");
                return;
            };
            actor.dispatch(request, ctx);
        }
        Ok(ws::Message::Close(_)) => {
            println!("Client websocket closed");
            ctx.stop();
        }
        _ => (),
    }
}
trait ServiceHandler: Actor {
    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut Self::Context);
}

pub struct WsHandler {
    state: web::Data<AppState>,
    pubsub_client: Arc<RwLock<pubsub_service::Client>>,
}

impl Actor for WsHandler {
    type Context = ws::WebsocketContext<Self>;

    fn started(&mut self, ctx: &mut Self::Context) {
        /*
        //let recipient = ctx.address().recipient();
        let addr = ctx.address();
        let pubsub_client = self.pubsub_client.clone();
        let future_task = async move {
            // create topic
            let request = pubsub_service::Request::new(pubsub::Topic {
                name: "topic_1".to_string(),
            });

            // create topic
            let res = pubsub_client
                .lock()
                .unwrap()
                .create_topic(request)
                .await
                .unwrap();
            //println!("RESPONSE={:?}", res);

            //let _res = recipient.do_send(CreateTopic {});
            addr.do_send(CreateTopic{});
        };
        future_task.into_actor(self).spawn(ctx);
        */
    }
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsHandler {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        if let Err(e) = msg {
            eprintln!("Err: WsHandler received message error {:?}", e);
            return;
        }

        dispatch(self, msg, ctx);
    }
}

impl ServiceHandler for WsHandler {
    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut ws::WebsocketContext<Self>) {
        let action;
        if let serde_json::value::Value::String(e) = &request["type"] {
            action = e;
        } else {
            return;
        }

        println!("type: {}", request["type"]);
        let fields = &request["fields"];
        let timestamp: u64 = fields["timestamp"].as_u64().unwrap_or(0);
        match action.as_ref() {
            "Status" => {
                let mut inbox = create_inbox("Status", timestamp);
                self.state.status.get_status(timestamp).map(|status| {
                    inbox.set_status(status);
                    send_inbox(&mut inbox, ctx);
                });
            }
            "type1" => {
                let message = json!({
                    "type": "type1",
                    "timestamp": timestamp,
                    "name": "hello world",
                });
                ctx.text(message.to_string())
            }
            "ChartPosition" => {
                let mut inbox = create_inbox("ChartPosition", timestamp);
                let pos = self.state.status.get_chart_position(timestamp);
                inbox.set_chartData(pos);
                send_inbox(&mut inbox, ctx);
            }
            "Position" => {
                let mut inbox = create_inbox("Position", timestamp);
                let position = self.state.status.get_position(timestamp);
                inbox.set_position(position);
                send_inbox(&mut inbox, ctx);
            }
            "Debug" => {
                let mut inbox = create_inbox("Debug", timestamp);
                let debug = self.state.status.get_debug(timestamp);
                inbox.set_debug(debug);
                send_inbox(&mut inbox, ctx);
            }
            _ => (),
        }
    }
}

async fn ws(
    req: HttpRequest,
    stream: web::Payload,
    state: web::Data<AppState>,
) -> Result<HttpResponse, Error> {
    let pubsub_client = pubsub_service::Client::connect("http://[::1]:50051".to_string())
        .await
        .unwrap();

    let actor = WsHandler {
        state: state.clone(),
        pubsub_client: Arc::new(RwLock::new(pubsub_client)),
    };

    let resp = ws::start(actor, &req, stream);
    println!("accept: {:?}", resp);
    resp
}

pub struct ImageHandler {
    spawn_handle: Option<actix::SpawnHandle>,
}

impl Actor for ImageHandler {
    type Context = ws::WebsocketContext<Self>;
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for ImageHandler {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        dispatch(self, msg, ctx);
    }
}

impl ServiceHandler for ImageHandler {
    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut ws::WebsocketContext<Self>) {
        let action;
        if let serde_json::value::Value::String(e) = &request["type"] {
            action = e;
        } else {
            return;
        }

        println!("type: {}", request["type"]);
        let fields = &request["fields"];
        match action.as_ref() {
            "Image" => {
                let scale_x: f64 = fields["scale_x"].as_f64().unwrap_or(1.0);
                let scale_y: f64 = fields["scale_y"].as_f64().unwrap_or(1.0);
                let timestamp: u64 = fields["timestamp"].as_u64().unwrap_or(0);
                let resource_name = fields["resource"].as_str().unwrap_or("").to_owned();

                println!(
                    "resource:{} frame:{} scale:{}, {}",
                    resource_name, timestamp, scale_x, scale_y
                );

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
                        return;
                    }
                } else {
                    return;
                }

                let mut inbox = create_inbox("Image", timestamp);
                let mut image_proto = api::proto::image::ImageData::new();
                image_proto.set_image(bytes);
                inbox.set_image(image_proto);
                send_inbox(&mut inbox, ctx);
            }
            "StopStreamImage" => {
                if let Some(handle) = self.spawn_handle {
                    ctx.cancel_future(handle);
                    self.spawn_handle = None;
                }
            }
            "StreamImage" => {
                if let Some(_) = self.spawn_handle {
                    println!("Already streaming.");
                    return;
                }

                let scale_x: f64 = fields["scale_x"].as_f64().unwrap_or(1.0);
                let scale_y: f64 = fields["scale_y"].as_f64().unwrap_or(1.0);
                let mut timestamp: u64 = fields["timestamp"].as_u64().unwrap_or(0);
                let resource_name = fields["resource"].as_str().unwrap_or("").to_owned();

                let handle =
                    ctx.run_interval(std::time::Duration::from_millis(33), move |_act, ctx| {
                        let image = Image::new(format!(
                            "./backend/assets/{}/{}.jpg",
                            resource_name, timestamp
                        ))
                        .resize(scale_x, scale_y);

                        let mut bytes: Vec<u8> = Vec::new();
                        if let Some(image) = image.data {
                            let res =
                                image.write_to(&mut bytes, image::ImageOutputFormat::Jpeg(75));
                            //let res = image.write_to(&mut bytes, image::ImageOutputFormat::Avif);
                            if res.is_err() {
                                return;
                            }
                        } else {
                            return;
                        }

                        let mut inbox = create_inbox("Image", timestamp);
                        let mut image_proto = api::proto::image::ImageData::new();
                        image_proto.set_image(bytes);

                        inbox.set_image(image_proto);
                        if let Ok(msg) = inbox.write_to_bytes() {
                            ctx.binary(msg);
                            timestamp += 1;
                        }
                    });

                self.spawn_handle = Some(handle);
            }
            _ => (),
        }
    }
}

async fn image_service(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let resp = ws::start(ImageHandler { spawn_handle: None }, &req, stream);
    println!("ImageService connect request: {:?}", req);
    println!("ImageService connect response: {:?}", resp);
    resp
}

struct StatusProvider {
    client: Arc<RwLock<pubsub_service::Client>>,
    status: Arc<RwLock<VecDeque<service_status::Status>>>,
    realtime: bool,
}

impl StatusProvider {
    pub async fn build(
        client: Arc<RwLock<pubsub_service::Client>>,
        realtime: bool,
    ) -> Result<Self, String> {
        let _res = client
            .write()
            .unwrap()
            .create_subscription("status".to_string(), "sub_1".to_string())
            .await;

        let _res = client
            .write()
            .unwrap()
            .create_subscription("status".to_string(), "StatusProvider/1".to_string())
            .await;

        let status = Arc::new(RwLock::new(VecDeque::new()));
        let status_arc = status.clone();
        let _res = client
            .write()
            .unwrap()
            .subscribe("sub_1".to_string(), move |msg| {
                let status = status_arc.clone();
                
                let message: service_status::Status = protobuf::Message::parse_from_bytes(&msg.data).unwrap();

                let mut values = status.write().unwrap();
                values.pop_front();
                values.push_back(message);
            })
            .await;

        Ok(Self {
            client,
            status: status,
            realtime: realtime,
        })
    }

    pub fn get_status(&self, timestamp: u64) -> Option<api::proto::message::Status> {
        let data = if self.realtime {
            let values = self.status.read().unwrap();
            if let Some(data) = values.get(0) {
                println!("get_state {}", data.get_debug());
                data.clone()
            } else {
                println!("empty");
                return None;
            }
        } else {
            let values = self.status.read().unwrap();
            if let Some(data) = values.get(0) {
                println!("get_state {}", data.get_debug());
                data.clone()
            } else {
                println!("empty");
                return None;
            }
        };

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
        let words = format!("hello there! 32");
        debug.set_value(words.to_string());
        status.set_debug(debug);

        // chart
        let mut point = api::proto::message::Point2DInt::new();
        point.set_x(timestamp as i64);
        point.set_y(timestamp as i64);
        status.set_chartData(point);

        Some(status)
    }

    pub fn get_position(&self, timestamp: u64) -> api::proto::message::Position32f {
        let mut position = api::proto::message::Position32f::new();
        position.set_x(timestamp as f32);
        position.set_y(timestamp as f32);
        position.set_z(0.0);
        position
    }

    pub fn get_debug(&self, timestamp: u64) -> api::proto::message::Debug {
        let mut debug = api::proto::message::Debug::new();
        debug.set_value("Debug info: hello there!".to_string());
        debug
    }

    pub fn get_chart_position(&self, timestamp: u64) -> api::proto::message::Point2DInt {
        let mut point = api::proto::message::Point2DInt::new();
        point.set_x(timestamp as i64);
        point.set_y(timestamp as i64 + 1);
        point
    }
}

pub struct AppState {
    status: StatusProvider,
}

impl AppState {
    pub async fn build(realtime: bool) -> Result<Self, String> {
        let client = Arc::new(RwLock::new(
            pubsub_service::Client::connect("http://[::1]:50051".to_string())
                .await
                .unwrap(),
        ));
        Ok(Self {
            status: StatusProvider::build(client.clone(), realtime)
                .await
                .unwrap(),
        })
    }
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // PubSub Server
    pubsub_service::Server::start("[::1]:50051");
    // nop to send response
    tokio::time::sleep(std::time::Duration::from_millis(100)).await;

    let realtime = true;
    let state = web::Data::new(AppState::build(realtime).await.unwrap());

    // Start server
    HttpServer::new(move || {
        App::new()
            .app_data(state.clone())
            .route("/ws", web::get().to(ws))
            .route("/image_service", web::get().to(image_service))
            .service(actix_files::Files::new("/", "./web/dist").show_files_listing())
    })
    .bind("127.0.0.1:4567")?
    .run()
    .await
}
