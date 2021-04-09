use std::sync::{Arc, RwLock};
use std::collections::HashMap;
use std::io::{Read, Write};
use uuid::Uuid;
use prost::Message as _;

use pubsub::pubsub_service;
use pubsub::proto::pubsub::PubsubMessage;

pub struct PubsubMessageProvider {
    pubsub: pubsub_service::Client,
    messages: Arc<RwLock<HashMap<String, Option<Box<PubsubMessage>>>>>,
    record: Arc<RwLock<bool>>,
    record_root: std::path::PathBuf,
}

impl PubsubMessageProvider {
    pub async fn new(
        pubsub_address: String,
        topics: Vec<String>
    ) -> Result<Self, String> {
        let record = Arc::new(RwLock::new(true));
        let record_root = std::path::PathBuf::from("/tmp/PubsubMessageProvider");
        if !std::path::Path::new(&record_root).exists() {
            let res = std::fs::create_dir_all(&record_root);
            if res.is_err() {
                return Err("PubsubMessageProvider: Fail to create /tmp/PubsubMessageProvider directory".to_string());
            }
        }

        let mut pubsub = match pubsub_service::Client::connect(pubsub_address).await {
            Ok(client) => client,
            Err(err) => {
                println!("{}", err);
                return Err("Fail to  connect pubusub server".into());
            }
        };

        // For live message
        let messages =  Arc::new(RwLock::new(HashMap::new()));
        for topic in &topics {
            // create entry
            messages.write().unwrap().insert(topic.into(), None);
            // create record directory for topic
            let mut record_path = Self::topic_to_path(&record_root, &*topic);
            if !std::path::Path::new(&record_path).exists() {
                let res = std::fs::create_dir_all(&record_path);
                if res.is_err() {
                    return Err(format!("PubsubMessageProvider: Fail to create {} directory", record_path.to_str().unwrap()));
                }
            }
    
            let sub_id = Uuid::new_v4().to_hyphenated().to_string();
            match pubsub
                .create_subscription(topic, &sub_id)
                .await 
            {
                Ok(_) => (),
                Err(e)=> return Err(format!("Error: create subscription {}", e))
            }

            let _res = pubsub
                .subscribe(&sub_id, {
                    let messages = messages.clone();
                    let record = record.clone();
                    // put dummy file_name for set_file_name
                    record_path.push("0");
                    let topic = topic.clone();
    
                    move |msg| {
                        let msg = if let Ok(message) = msg {
                            message
                        } else {
                            return;
                        };
                        
                        if *record.read().unwrap() {
                            record_path.set_file_name(&msg.timestamp.to_string());

                            let mut buf: Vec<u8> = Vec::new();
                            //let res = prost::Message::encode(&msg, &mut buf);
                            let _res = msg.encode(&mut buf).map(|_| {
                                let _ = std::fs::File::create(&record_path).map(|mut file| {
                                    let _ = file.write_all(&buf).map(|_| file.flush());
                                });
                            }).map_err(|err| {
                                println!("message encodeing is fail");
                                err
                            });
                        }
                        
                        println!("Record timestamp: {}", msg.timestamp);
                        let mut db = messages.write().unwrap();
                        *db.get_mut(&topic).unwrap() = Some(Box::new(msg));
                        
                    }
                })
                .await;
        }    

        Ok(Self {
            pubsub,
            messages,
            record,
            record_root,
        })
    }

    pub async fn close(&mut self){
        let _res = self.pubsub.close().await;
    }

    fn topic_to_path(root: &std::path::PathBuf, topic: &str) -> std::path::PathBuf{
        let mut path = root.clone();
        let dic = topic.replace("/", "_");
        path.push(dic);
        path
    }

    pub fn collect_timestamps(&self, topic:&str, start_time: u64, end_time: u64) -> Vec<u64> {
        let timestamps = self.collect_all_timestamps(topic);
        timestamps.into_iter().filter(|&t| start_time <= t && t <= end_time).collect::<Vec<_>>()
    }


    pub fn collect_all_timestamps(&self, topic: &str) -> Vec<u64> {
        let mut timestamps= Vec::new();
        let path = Self::topic_to_path(&self.record_root, topic);
        let res = std::fs::read_dir(path);
        if let Ok(readdir) = res {
            for entry in readdir {
                let _ = entry.map(|entry| {
                    entry.path().file_name().map(|file_name| {
                        file_name.to_str().map(|file_name| {
                            file_name.parse::<u64>().ok().map(|num | {
                                timestamps.push(num);
                            })
                        })
                    })
                });
            }
        }

        timestamps.sort();
        timestamps
    }
    
    pub fn enable_record(&self, enable: bool) {
        *self.record.write().unwrap() = enable;
    }

    fn fetch(&self, topic: &str, timestamp: Option<u64>) -> Option<PubsubMessage>{
        let data = match timestamp {
            None => {
                println!("live topic: {}", topic);
                let values = self.messages.read().unwrap();
                values.get(topic).and_then(|data| {
                    if let Some(message) = data {
                        Some(message.as_ref().clone())
                    } else {
                        None
                    }
                })
            }
            Some(timestamp) => {
                //println!("file topic: {}", topic);
                let mut path = Self::topic_to_path(&self.record_root, topic);
                path.push(std::path::Path::new(&timestamp.to_string()));
                
                match std::fs::File::open(path) {
                    Ok(mut file) => {
                        let mut buf = Vec::new();
                        let res = file.read_to_end(&mut buf);
                        res.ok().and_then(|_| {
                            let buf = std::io::Cursor::new(buf);
                            let res: Result<PubsubMessage, _> = prost::Message::decode(buf);
                            res.ok()
                        })
                    }
                    Err(_e) => None,
                }
            }
        };

        data
    }

    pub fn get(&self, topic: &str, timestamp: Option<u64>) -> Option<PubsubMessage> {
        self.fetch(topic, timestamp)
    }
}
