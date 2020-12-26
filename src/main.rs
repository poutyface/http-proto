use actix::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self, NamedFile};
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder, Result};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use proto;
use protobuf::Message;
use serde_json::{self, json};
use std::path::PathBuf;

struct WebSocketHandler {
    spawn_handle: Option<actix::SpawnHandle>,
}

impl Actor for WebSocketHandler {
    type Context = ws::WebsocketContext<Self>;
}

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WebSocketHandler {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        match msg {
            Ok(ws::Message::Ping(msg)) => {
                println!("ping");
                ctx.pong(&msg)
            }
            Ok(ws::Message::Text(text)) => {
                println!("text");

                let json_value: serde_json::Result<serde_json::Value> = serde_json::from_str(&text);
                let v = if json_value.is_ok() {
                    json_value.unwrap()
                } else {
                    return;
                };

                println!("type: {}", v["type"]);

                let event;
                if let serde_json::value::Value::String(e) = &v["type"] {
                    event = e;
                } else {
                    return;
                }

                match event.as_ref() {
                    "type1" => {
                        let message = json!({
                            "type": "type1",
                            "name": "hello world",
                        });
                        ctx.text(message.to_string())
                    }
                    "type2" => {
                        let mut inbox = proto::message::Inbox::new();

                        let mut position = proto::message::Position::new();
                        position.set_x(32);
                        position.set_y(64);
                        inbox.set_position(position);

                        if let Ok(msg) = inbox.write_to_bytes() {
                            println!("{:?}", msg);
                            ctx.binary(msg);
                        }
                    }
                    "type3" => {
                        let mut inbox = proto::message::Inbox::new();

                        let mut status = proto::message::Status::new();
                        status.set_field_type("hello there!".to_string());
                        inbox.set_status(status);
                        if let Ok(msg) = inbox.write_to_bytes() {
                            println!("{:?}", msg);
                            ctx.binary(msg);
                        }
                    }
                    "RequestImage" => {
                        let scale_x: f64 = v["data"]["scale_x"].as_f64().unwrap_or(1.0);
                        let scale_y: f64 = v["data"]["scale_y"].as_f64().unwrap_or(1.0);
                        let frame_id = v["data"]["frame_id"].as_i64().unwrap_or(0);
                        let resource_name = v["data"]["resource"].as_str().unwrap_or("");

                        println!(
                            "resource:{} frame:{} scale:{}, {}",
                            resource_name, frame_id, scale_x, scale_y
                        );
                        let img = match image::io::Reader::open(format!(
                            "./backend/assets/{}/{}.jpg",
                            resource_name, frame_id
                        )) {
                            Ok(img) => match img.decode() {
                                Ok(img) => img,
                                Err(_) => return,
                            },
                            Err(_) => {
                                println!("Error open asset {} {}", resource_name, frame_id);
                                return;
                            }
                        };

                        let target_width = (scale_x * img.width() as f64) as u32;
                        let target_height = (scale_y * img.height() as f64) as u32;
                        let img = img.resize(
                            target_width,
                            target_height,
                            image::imageops::FilterType::Nearest,
                        );

                        let mut bytes: Vec<u8> = Vec::new();
                        if img
                            .write_to(&mut bytes, image::ImageOutputFormat::Jpeg(50))
                            .is_err()
                        {
                            return;
                        }

                        let mut image_update = proto::image_update::ImageUpdate::new();
                        image_update.set_image(bytes);
                        if let Ok(msg) = image_update.write_to_bytes() {
                            ctx.binary(msg);
                        }
                    }
                    "RequestStreamImage" => {
                        if let Some(handle) = self.spawn_handle {
                            ctx.cancel_future(handle);
                            self.spawn_handle = None;
                            return;
                        }

                        let scale_x: f64 = v["data"]["scale_x"].as_f64().unwrap_or(1.0);
                        let scale_y: f64 = v["data"]["scale_y"].as_f64().unwrap_or(1.0);
                        let mut frame_id = v["data"]["frame_id"].as_i64().unwrap_or(0);
                        let resource_name = v["data"]["resource"].as_str().unwrap_or("").to_owned();

                        let handle = ctx.run_interval(
                            actix::clock::Duration::from_millis(33),
                            move |_act, ctx| {
                                let img = match image::io::Reader::open(format!(
                                    "./backend/assets/{}/{}.jpg",
                                    resource_name, frame_id
                                )) {
                                    Ok(img) => match img.decode() {
                                        Ok(img) => img,
                                        Err(_) => return,
                                    },
                                    Err(_) => {
                                        println!("Error open asset {} {}", resource_name, frame_id);
                                        return;
                                    }
                                };

                                frame_id += 1;

                                let target_width = (scale_x * img.width() as f64) as u32;
                                let target_height = (scale_y * img.height() as f64) as u32;
                                let img = img.resize(
                                    target_width,
                                    target_height,
                                    image::imageops::FilterType::Nearest,
                                );

                                let mut bytes: Vec<u8> = Vec::new();
                                if img
                                    .write_to(&mut bytes, image::ImageOutputFormat::Jpeg(75))
                                    .is_err()
                                {
                                    return;
                                }

                                let mut image_update = proto::image_update::ImageUpdate::new();
                                image_update.set_image(bytes);
                                if let Ok(msg) = image_update.write_to_bytes() {
                                    ctx.binary(msg);
                                }
                            },
                        );

                        self.spawn_handle = Some(handle);
                    }
                    _ => (),
                }
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
