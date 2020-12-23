import { WebsocketEndpoint } from './websocket_endpoint.js';
import Worker from './image_canvas.worker.js';
const protobuf = require('protobufjs/light');
const protoBundle = require("./proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);


let ws = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
ws.init();

ws.on('type1', (data) => {
    console.log(data);
    document.getElementById("type1-res").innerHTML = JSON.stringify(data);
});

ws.onBinary((data) => {
    let Inbox = protoRoot.lookupType("Inbox");
    let inbox = Inbox.decode(new Uint8Array(data));
    let obj = Inbox.toObject(inbox, {enums: String});
    document.getElementById("inbox-type").innerHTML = inbox.Blob;
    document.getElementById("type2-res").innerHTML = JSON.stringify(obj);
});

document.getElementById("ws-send-button-1").addEventListener('click', () => {
    ws.sendData("type1", {});
});
document.getElementById("ws-send-button-2").addEventListener('click', () => {
    ws.sendData("type2", {});
});
document.getElementById("ws-send-button-3").addEventListener('click', () => {
    ws.sendData("type3", {});
});


class RemoteImageDataProvider {
    constructor(address, resource){
        this.address = address;
        this.resource = resource;
        this.ws = new WebsocketEndpoint(this.address);
        this.ws.init();
    }

    on(func){
        this.ws.onBinary(func);
    }

    getMessage(message, frameId){
        this.ws.sendData(message, {resource: this.resource, frame_id: frameId, scale_x: 0.5, scale_y: 0.5});
    }
}

class ImageCanvas {
    constructor(htmlCanvas, dataProvider) {
        this.htmlCanvas = htmlCanvas;
        this.dataProvider = dataProvider;

        this.worker = new Worker();
        let offscreen = htmlCanvas.transferControlToOffscreen();
        this.worker.postMessage({type: "initialize", canvas: offscreen}, [offscreen]);

        this.dataProvider.on((data) => {
            this.worker.postMessage({type: "renderImage", data: data});
        });
    }

    requestImage(frameId){
        this.dataProvider.getMessage("RequestImage", frameId);
    }

    requestStreamImage(frameId){
        this.dataProvider.getMessage("RequestStreamImage", frameId);
    }

}

let remoteDataProvider = new RemoteImageDataProvider("ws://127.0.0.1:8080/ws", "test_images");
let imageCanvas1 = new ImageCanvas(document.getElementById("canvas-1"), remoteDataProvider);

document.getElementById("image-stream").addEventListener('click', () => {
    imageCanvas1.requestStreamImage(1);
});


/*
imageWorker.onmessage = (event) => {
    let image = new Image();
    image.src = `data:image/jpeg;base64,${event.data.image}`;
    image.decode().then(() => {
        htmlCanvas.width = image.width;
        htmlCanvas.height = image.height;
        htmlCanvas.getContext("2d").drawImage(image, 0, 0);
    });
};
*/


class SequenceNumberUpdater {
    constructor(startNumber, priodMs, callbackFn){
        this.priodMs = priodMs;
        this.startNumber = startNumber;
        this.currentNumber = this.startNumber;
        this.timer = null;
        this.callbackFn = callbackFn;
        this.isStarted = false;
    }

    start(){
        this.timer = setInterval(() => {
            this.callbackFn(this.currentNumber);
            this.currentNumber += 1;
        }, this.priodMs);
        this.isStarted = true;
    }
    
    stop(){
        clearInterval(this.timer);
        this.isStarted = false;
    }

    reset(){
        clearInterval(this.timer);
        this.isStarted = false;
        this.currentNumber = this.startNumber;
    }
}

let seqTimer = new SequenceNumberUpdater(1, 33, (n) => {
    console.log(n);
    imageCanvas1.requestImage(n);
});

document.getElementById("image-play").addEventListener('click', () => {
    if(seqTimer.isStarted == false){
        seqTimer.start();
    }
    else{
        seqTimer.stop();
    }
});
document.getElementById("image-reset").addEventListener('click', () => {
    seqTimer.reset();
});
document.getElementById("image-step").addEventListener('click', () => {
    seqTimer.currentNumber += 1;
    imageCanvas1.requestImage(seqTimer.currentNumber);
});
document.getElementById("image-back").addEventListener('click', () => {
    seqTimer.currentNumber -= 1;
    imageCanvas1.requestImage(seqTimer.currentNumber);
});
