use actix::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self};
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, Result};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use proto;
use protobuf::Message;
use serde_json::{self, json};


struct Image {
    data: Option<image::DynamicImage>,
}

impl Image {
    fn new(path: String) -> Self {
        let reader = image::io::Reader::open(path);
        
        let mut image = None;
        if reader.is_ok() {
            image = match reader.unwrap().decode() {
                Ok(image) => Some(image),
                Err(_) => None,
            }
        }

        Self {
            data: image,
        }
    }

    fn resize(mut self, scale_width: f64, scale_height: f64) -> Self {

        if let Some(image) = self.data {
            let width = (scale_width * image.width() as f64) as u32;
            let height = (scale_height * image.height() as f64) as u32;

            self.data = Some(image.resize(width, height, image::imageops::FilterType::Nearest));
        };

        self
    }
}

struct WebSocketHandler {
    spawn_handle: Option<actix::SpawnHandle>,
}

impl Actor for WebSocketHandler {
    type Context = ws::WebsocketContext<Self>;
}

impl WebSocketHandler {
    fn send_inbox(&self, inbox: &mut proto::message::Inbox, ctx: &mut ws::WebsocketContext<Self>){
        if let Ok(msg) = inbox.write_to_bytes() {
            ctx.binary(msg);
        }
    }

    fn handle_request(&mut self, request: serde_json::Value, ctx: &mut ws::WebsocketContext<Self>){
        let action;
        if let serde_json::value::Value::String(e) = &request["type"] {
            action = e;
        } else {
            return;
        }

        println!("type: {}", request["type"]);
        match action.as_ref() {
            "State" => {
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let mut inbox = create_inbox("State", timestamp);

                let mut state = proto::message::State::new();

                // Position
                let mut position = proto::message::Position32f::new();
                position.set_x(timestamp as f32 + 1e-6);
                position.set_y(timestamp as f32 + 1e-6);
                position.set_z(1e-6);
                state.set_position(position);

                // Status
                let mut status = proto::message::Status::new();
                status.set_status("hello there!".to_string());
                state.set_status(status);

                // chart
                let mut point = proto::message::Point2DInt::new();
                point.set_x(timestamp as i64);
                point.set_y(timestamp as i64);
                state.set_chartData(point);

                inbox.set_state(state);
                self.send_inbox(&mut inbox, ctx)
            }
            "type1" => {
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let message = json!({
                    "type": "type1",
                    "timestamp": timestamp,
                    "name": "hello world",
                });
                ctx.text(message.to_string())
            }
            "ChartPosition" => {
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let mut inbox = create_inbox("ChartPosition", timestamp);
                
                let mut point = proto::message::Point2DInt::new();
                point.set_x(timestamp as i64);
                point.set_y(timestamp as i64 + 1);
                
                inbox.set_chartData(point);
                self.send_inbox(&mut inbox, ctx);
            }
            "Position" => {
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let mut inbox = create_inbox("Position", timestamp);
                let mut position = proto::message::Position32f::new();
                position.set_x(timestamp as f32 + 1e-6);
                position.set_y(timestamp as f32 + 1e-6);
                position.set_z(1e-6);
                inbox.set_position(position);

                self.send_inbox(&mut inbox, ctx);
            }
            "Status" => {
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let mut inbox = create_inbox("Status", timestamp);
                let mut status = proto::message::Status::new();
                status.set_status("hello there!".to_string());
                inbox.set_status(status);
                self.send_inbox(&mut inbox, ctx);
            }
            "Image" => {
                let scale_x: f64 = request["data"]["scale_x"].as_f64().unwrap_or(1.0);
                let scale_y: f64 = request["data"]["scale_y"].as_f64().unwrap_or(1.0);
                let timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let resource_name = request["data"]["resource"].as_str().unwrap_or("");

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
                } else{
                    return;
                }

                let mut inbox = create_inbox("Image", timestamp);
                let mut image_update = proto::image_update::ImageUpdate::new();
                image_update.set_image(bytes);
                inbox.set_imageUpdate(image_update);
                self.send_inbox(&mut inbox, ctx);
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
                
                let scale_x: f64 = request["data"]["scale_x"].as_f64().unwrap_or(1.0);
                let scale_y: f64 = request["data"]["scale_y"].as_f64().unwrap_or(1.0);
                let mut timestamp: u64 = request["data"]["timestamp"].as_u64().unwrap_or(0);
                let resource_name = request["data"]["resource"].as_str().unwrap_or("").to_owned();

                let handle = ctx.run_interval(
                    actix::clock::Duration::from_millis(33),
                    move |_act, ctx| {
                        let image = Image::new(format!(
                            "./backend/assets/{}/{}.jpg",
                            resource_name, timestamp
                        ))
                        .resize(scale_x, scale_y);

                        let mut bytes: Vec<u8> = Vec::new();
                        if let Some(image) = image.data {
                            let res = image.write_to(&mut bytes, image::ImageOutputFormat::Jpeg(75));
                            //let res = image.write_to(&mut bytes, image::ImageOutputFormat::Avif);
                            if res.is_err() {
                                return;
                            }
                        } else{
                            return;
                        }

                        let mut inbox = create_inbox("Image", timestamp);        
                        let mut image_update = proto::image_update::ImageUpdate::new();
                        image_update.set_image(bytes);

                        inbox.set_imageUpdate(image_update);
                        if let Ok(msg) = inbox.write_to_bytes() {
                            ctx.binary(msg);
                            timestamp += 1;
                        }

                    },
                );
                
                self.spawn_handle = Some(handle);
            }
            _ => (),
        }
    }
}

fn create_inbox(type_name: &str, timestamp: u64) -> proto::message::Inbox {
    let mut inbox = proto::message::Inbox::new();
    inbox.set_field_type(type_name.to_string());
    inbox.set_timestamp(timestamp);
    inbox
}


impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketHandler {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                println!("ping");
                ctx.pong(&msg)
            }
            Ok(ws::Message::Text(text)) => {
                let json_value: serde_json::Result<serde_json::Value> = serde_json::from_str(&text);
                let request = if json_value.is_ok() {
                    json_value.unwrap()
                } else {
                    println!("Warning: failt to decode json");
                    return;
                };

                self.handle_request(request, ctx);
            }
            Ok(ws::Message::Binary(bin)) => {
                println!("bin");
                ctx.binary(bin)
            }
            _ => (),
        }
    }
}

async fn ws(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let resp = ws::start(WebSocketHandler { spawn_handle: None }, &req, stream);
    println!("accept: {:?}", resp);
    resp
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    HttpServer::new(|| {
        App::new()
            .route("/ws", web::get().to(ws))
            .service(actix_files::Files::new("/", "./web/dist").show_files_listing())
    })
    .bind("127.0.0.1:8080")?
    .run()
    .await
}
