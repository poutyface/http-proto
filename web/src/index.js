let protobuf = require('protobufjs');
import { WebsocketEndpoint } from './websocket_endpoint.js';


let protoBundle = require("./proto_bundle.json");
let protoRoot = protobuf.Root.fromJSON(protoBundle);


let ws = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
ws.init();

ws.on('type1', (data) => {
    console.log(data);
    document.getElementById("type1-res").innerHTML = JSON.stringify(data);
});

ws.onBinary((data) => {
    let Status = protoRoot.lookupType("Status");
    let message = Status.decode(new Uint8Array(data));
    let obj = Status.toObject(message, {enums: String});
    document.getElementById("type2-res").innerHTML = message;
    console.log(obj.type)
});

document.getElementById("ws-send-button-1").addEventListener('click', () => {
    ws.sendData("type1", {});
});
document.getElementById("ws-send-button-2").addEventListener('click', () => {
    ws.sendData("type2", {});
});


// Handle image 
let wsImage = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
wsImage.init();
wsImage.onBinary((data) => {

    let imageUpdate = protoRoot.lookupType("ImageUpdate");
    let message = imageUpdate.decode(new Uint8Array(data));
    let obj = imageUpdate.toObject(message, {enums: String});
    console.log("recieve image");
    // encode base64, and set image src
    let image = `data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null,obj.image))}`;
    let imageTag = document.getElementById("image-1");
    imageTag.src = image;

});

document.getElementById("ws-send-button-3").addEventListener('click', () => {
    wsImage.sendData("RequestImage", {resource: "test_images", frame_id: 1, scale_x: 0.5, scale_y: 0.5});
});

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

let seqTimer = new SequenceNumberUpdater(1, 100, (n) => {
    console.log(n);
    wsImage.sendData("RequestImage", {resource: "test_images", frame_id: n, scale_x: 0.5, scale_y: 0.5});
});

document.getElementById("ws-send-button-4").addEventListener('click', () => {
    if(seqTimer.isStarted == false){
        seqTimer.start();
    }
    else{
        seqTimer.stop();
    }
});
document.getElementById("ws-send-button-5").addEventListener('click', () => {
    seqTimer.reset();
});
document.getElementById("ws-send-button-6").addEventListener('click', () => {
    seqTimer.currentNumber += 1;
    wsImage.sendData("RequestImage", {resource: "test_images", frame_id: seqTimer.currentNumber, scale_x: 0.5, scale_y: 0.5});
});
document.getElementById("ws-send-button-7").addEventListener('click', () => {
    seqTimer.currentNumber -= 1;
    wsImage.sendData("RequestImage", {resource: "test_images", frame_id: seqTimer.currentNumber, scale_x: 0.5, scale_y: 0.5});
});








/*
socket.onopen = function() {
    document.getElementById("ws").innerHTML = "connect";
};
*/
    
