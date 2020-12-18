use actix::{Actor, StreamHandler};
use actix_files::{self, NamedFile};
use actix_web::{
    web, App, Error, HttpRequest, HttpResponse, HttpServer, Responder, Result,
};
use actix_web_actors::ws;
use serde_json::{self, json};
use std::path::PathBuf;
use protobuf::Message;
use proto;
use image::{self, GenericImageView};

struct WebSocketHandler;

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
                let v: serde_json::Value = serde_json::from_str(&text).unwrap();
                println!("type: {}", v["type"]);

                if let serde_json::value::Value::String(event) = &v["type"] {
                    
                    match event.as_ref() {
                        "type1" => {
                            let message = json!({
                                "type": "type1",
                                "name": "hello world",
                            });
                            ctx.text(message.to_string())
                        }
                        "type2" => {
                            let mut status = proto::message::Status::new();
                            status.set_field_type("hello there!".to_string());
                            let msg = status.write_to_bytes().unwrap();
                            println!("{:?}", msg);
                            ctx.binary(msg)
                        }
                        "RequestImage" => {
                            let mut scale_x: f64 = 1.0;
                            let mut scale_y: f64  = 1.0;
                            let mut frame_id = 0;
                            let mut resource_name = "";
                            if let serde_json::value::Value::Number(scale) = &v["data"]["scale_x"] {
                                scale_x = scale.as_f64().unwrap();
                            };
                            if let serde_json::value::Value::Number(scale) = &v["data"]["scale_y"] {
                                scale_y = scale.as_f64().unwrap();
                            }
                            if let serde_json::value::Value::Number(num) = &v["data"]["frame_id"] {
                                frame_id = num.as_i64().unwrap();
                            }
                            if let serde_json::value::Value::String(name) = &v["data"]["resource"] {
                                resource_name = name.as_str();
                            }

                            println!("resource:{} frame:{} scale:{}, {}", resource_name, frame_id, scale_x, scale_y);
                            let img = match image::io::Reader::open(format!("./backend/assets/{}/{}.jpg", resource_name, frame_id)) {
                                Ok(img) => {
                                    match img.decode() {
                                        Ok(img) => img,
                                        Err(_) => return
                                    }
                                },
                                Err(_) => {
                                    println!("Error open asset {} {}", resource_name, frame_id);
                                    return
                                }
                            };


                            let width = img.width() as f64;
                            let height = img.height() as f64;
                            let target_width = (scale_x * width) as u32;
                            let target_height = (scale_y * height) as u32;
                            let img = img.resize(target_width, target_height, image::imageops::FilterType::Nearest);

                            let mut bytes: Vec<u8> = Vec::new();
                            img.write_to(&mut bytes, image::ImageOutputFormat::Jpeg(50)).unwrap();
                            
                            let mut image_update = proto::image_update::ImageUpdate::new();
                            image_update.set_image(bytes);
                            let msg = image_update.write_to_bytes().unwrap();
                            ctx.binary(msg);
                        }
                    _ => ()
                    }

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
    let resp = ws::start(WebSocketHandler{}, &req, stream);
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
