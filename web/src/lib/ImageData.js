import {Playback, PlaybackController} from 'lib/Playback.js';
import { WebsocketEndpoint } from 'lib/websocket_endpoint.js';
import Worker from 'lib/image_canvas.worker.js';

export class RemoteImageDataProvider {
    constructor(address, resource){
        this.address = address;
        this.resource = resource;
        this.ws = new WebsocketEndpoint(this.address);
        this.cacheStore = {};
        this.handler = null;
    }

    connect(){
        try {
            this.ws.connect();
        } catch (error) {
            throw error;
        }
    }

    close(){
        this.ws.close();
    }
    
    on(handler){
        this.handler = handler;
        this.ws.on('Image', (data) => {
            this.cacheStore[data.timestamp] = data;
            if(this.handler){
                this.handler(data);
            }
        });
    }
    
    getMessage(message, scale=1.0, timestamp=-1){
        if(message === 'Image' && timestamp in this.cacheStore){
            console.log(timestamp);
            this.handler(this.cacheStore[timestamp]);
        } else {
            if(timestamp === -1){
                this.ws.sendData(message, {});
            } else{
                this.ws.sendData(message, {resource: this.resource, timestamp: timestamp, scale_x: scale, scale_y: scale});
            }
        }
    }
}

export class ImageDataController {
    constructor(dataProvider){
        this.dataProvider = dataProvider;
        this.playback = new PlaybackController();
        this.isStreaming = false;
        this.scale = 1.0;

        this.playback.on((timestamp) => {
            if(this.isStreaming){
                this.dataProvider.getMessage("StreamImage", this.scale, timestamp);
            } else {
                this.dataProvider.getMessage("Image", this.scale, timestamp);
            }
        });

        this.worker = new Worker();
        this.worker.addEventListener('message', (event) => {
            if(this.isStreaming){
                this.playback.seek(event.data.timestamp);
            }
        });

        this.canvas = document.createElement("canvas");
        const offscreen = this.canvas.transferControlToOffscreen();
        this.worker.postMessage({type: "initialize", canvas: offscreen}, [offscreen]);

        this.dataProvider.on((data) => {
            this.worker.postMessage({type: "render", inbox: data});
        });
    }

    reset(){
        this.playback.reset();
        this.isStreaming = false;
    }

    seek(timestamp) {
        this.playback.seek(timestamp);
    }

    startStream(){
        this.isStreaming = true;
        this.playback.next();
    }
    
    stopStream(){
        this.isStreaming = false;
        this.dataProvider.getMessage("StopStreamImage");
    }

    start() {
        this.playback.start();
    }

    stop(){
        this.playback.stop();
    }

    step(){
        this.playback.next();
    }

    back(){
        this.playback.back();
    }
}

