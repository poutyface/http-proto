use actix::*;
use actix::{self, Actor, StreamHandler};
use actix_files::{self};
use actix_web::{web, App, Error, HttpRequest, HttpResponse, HttpServer, Result};
use actix_web_actors::ws;
use image::{self, GenericImageView};
use proto;
use protobuf::Message;
use serde_json::{self, json};

pub struct Image {
    data: Option<image::DynamicImage>,
}

impl Image {
    pub fn new(path: String) -> Self {
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

    pub fn resize(mut self, scale_width: f64, scale_height: f64) -> Self {

        if let Some(image) = self.data {
            let width = (scale_width * image.width() as f64) as u32;
            let height = (scale_height * image.height() as f64) as u32;

            self.data = Some(image.resize(width, height, image::imageops::FilterType::Nearest));
        };

        self
    }
}


pub fn send_inbox<A>(inbox: &mut proto::message::Inbox, ctx: &mut ws::WebsocketContext<A>)
where 
A: Actor<Context = ws::WebsocketContext<A>>{
    if let Ok(msg) = inbox.write_to_bytes() {
        ctx.binary(msg);
    }    
}    


pub fn create_inbox(type_name: &str, timestamp: u64) -> proto::message::Inbox {
    let mut inbox = proto::message::Inbox::new();
    inbox.set_field_type(type_name.to_string());
    inbox.set_timestamp(timestamp);
    inbox
}


fn dispatch<A: Actor + ServiceHandler>(actor: &mut A, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut A::Context){
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
        _ => (),
    }
}
trait ServiceHandler: Actor {
    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut Self::Context);
}

pub struct WsHandler{
    service: web::Data<Service>,
}    

impl Actor for WsHandler {
    type Context = ws::WebsocketContext<Self>;
}    

impl StreamHandler<Result<ws::Message, ws::ProtocolError>> for WsHandler {
    fn handle(&mut self, msg: Result<ws::Message, ws::ProtocolError>, ctx: &mut Self::Context) {
        dispatch(self, msg, ctx);
    }    
}


impl ServiceHandler for WsHandler {
    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut ws::WebsocketContext<Self>){
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
            "State" => {
                let mut inbox = create_inbox("State", timestamp);
                let state = self.service.state.get_state(timestamp);
                inbox.set_state(state);
                println!("{:?}", inbox);
                send_inbox(&mut inbox, ctx)
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
                let pos = self.service.state.get_chart_position(timestamp);                
                inbox.set_chartData(pos);
                send_inbox(&mut inbox, ctx);
            }    
            "Position" => {
                let mut inbox = create_inbox("Position", timestamp);
                let position = self.service.state.get_position(timestamp);
                inbox.set_position(position);
                send_inbox(&mut inbox, ctx);
            }    
            "Status" => {
                let mut inbox = create_inbox("Status", timestamp);
                let status = self.service.state.get_status(timestamp);
                inbox.set_status(status);
                send_inbox(&mut inbox, ctx);
            }    
            _ => (),
        }    
    }    
}    


async fn ws(req: HttpRequest, stream: web::Payload, data: web::Data<Service>)  -> Result<HttpResponse, Error> {
    let actor = WsHandler {
        service: data.clone(),
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

    fn dispatch(&mut self, request: serde_json::Value, ctx: &mut ws::WebsocketContext<Self>){
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
                } else{
                    return;
                }

                let mut inbox = create_inbox("Image", timestamp);
                let mut image_proto = proto::image::ImageData::new();
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
                        let mut image_proto = proto::image::ImageData::new();
                        image_proto.set_image(bytes);

                        inbox.set_image(image_proto);
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


async fn image_service(req: HttpRequest, stream: web::Payload) -> Result<HttpResponse, Error> {
    let resp = ws::start(ImageHandler { spawn_handle: None }, &req, stream);
    println!("ImageService connect request: {:?}", req);
    println!("ImageService connect response: {:?}", resp);
    resp
}


pub struct StateService {
    foo: i32,
}

impl StateService {
    pub fn new() -> Self{ 
        Self {
            foo: 32,
        }        
    }

    pub fn get_state(&self, timestamp: u64) -> proto::message::State {
        let mut state = proto::message::State::new();

        // Position
        let mut position = proto::message::Position32f::new();
        position.set_x(timestamp as f32);
        position.set_y(timestamp as f32);
        position.set_z(0.0);
        state.set_position(position);

        // Status
        let mut status = proto::message::Status::new();
        let words = format!("hello there! {}", self.foo);
        status.set_status(words.to_string());
        state.set_status(status);

        // chart
        let mut point = proto::message::Point2DInt::new();
        point.set_x(timestamp as i64);
        point.set_y(timestamp as i64);
        state.set_chartData(point);

        state
    }
    
    pub fn get_position(&self, timestamp: u64) -> proto::message::Position32f{
        let mut position = proto::message::Position32f::new();
        position.set_x(timestamp as f32);
        position.set_y(timestamp as f32);
        position.set_z(0.0);
        position
    }

    pub fn get_status(&self, timestamp: u64) -> proto::message::Status {
        let mut status = proto::message::Status::new();
        status.set_status("hello there!".to_string());
        status
    }

    pub fn get_chart_position(&self, timestamp: u64) -> proto::message::Point2DInt {
        let mut point = proto::message::Point2DInt::new();
        point.set_x(timestamp as i64);
        point.set_y(timestamp as i64 + 1);
        point
    }

}

struct Service{
    state: StateService,
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {

    let state = StateService::new();

    let service = web::Data::new(Service {
        state,
    });

    HttpServer::new(move || {
        App::new()
            .app_data(service.clone())
            .route("/ws", web::get().to(ws))
            .route("/image_service", web::get().to(image_service))
            .service(actix_files::Files::new("/", "./web/dist").show_files_listing())
    })
    .bind("127.0.0.1:4567")?
    .run()
    .await
}
