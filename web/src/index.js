import { WebsocketEndpoint } from './websocket_endpoint.js';
import Worker from './image_canvas.worker.js';


import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';

const protobuf = require('protobufjs/light');
const protoBundle = require("./proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);
const imageUpdate = protoRoot.lookupType("ImageUpdate");


function LoadState() {
    const [state, setState] = useState("Init");
    return (<div><p>{state}</p></div>);
}

function RequestType1() {
    const ws = useRef(null);
    const textAreaEl = useRef(null);
    const accTextValue = useRef("");
    const [resType1, setResType1] = useState("");
    const [resType2, setResType2] = useState("");
    const [textValue, setTextValue] = useState("");

    useEffect(() => {
        ws.current = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
        ws.current.init();
        ws.current.on('type1', (data) => {
            setResType1(JSON.stringify(data));
        });
        ws.current.onBinary((data) => {
            const Inbox = protoRoot.lookupType("Inbox");
            const inbox = Inbox.decode(new Uint8Array(data));
            const obj = Inbox.toObject(inbox, {enums: String});
            setResType2(JSON.stringify(obj));
            accTextValue.current += JSON.stringify(obj) + '\n';
            const textLength = accTextValue.current.length; 
            if(textLength > 1000){
                accTextValue.current = accTextValue.current.substring(textLength-1000);
            }
            setTextValue(accTextValue.current);
        });

        
    }, []);
    
    useEffect(() => {
        textAreaEl.current.scrollTop = textAreaEl.current.scrollHeight;
    }, [textValue]);

    function request(action) {
        ws.current.sendData(action, {});
    }

    return (
        <div>
        <button onClick={() => request("type1")}>Type1: Tx:JSON, Rx:JSON</button>
        <p>{resType1}</p>
        <button onClick={() => request("type2")}>Type2: position Tx:JSON, Rx:Proto</button>
        <button onClick={() => request("type3")}>Type3: status Tx:JSON, Rx:Proto</button>
        <p>{resType2}</p>
        <textarea ref={textAreaEl} defaultValue={textValue} cols="80" rows="5"></textarea>
        </div>
    );
}


class RemoteImageDataProvider {
    constructor(address, resource){
        this.address = address;
        this.resource = resource;
        this.ws = new WebsocketEndpoint(this.address);
        this.ws.init();
        this.cacheStore = {};
        this.func = null;
    }
    
    on(func){
        this.func = func;
        this.ws.onBinary((data) => {
            const message = imageUpdate.decode(new Uint8Array(data));
            this.cacheStore[message.timestamp] = message;        
            this.func(message);
        });
    }
    
    getMessage(message, frameId){
        if(message === 'Image' && frameId in this.cacheStore){
            console.log(frameId);
            this.func(this.cacheStore[frameId]);
        } else {
            this.ws.sendData(message, {resource: this.resource, frame_id: frameId, scale_x: 0.5, scale_y: 0.5});
        }
    }
}

class Playback {
    constructor() {
        this.timestamp = -1;
        this.reset();
    }

    seek(timestamp){
        this.timestamp = timestamp - 1;
    }

    next(){
        this.timestamp += 1;
        return this.timestamp;
    }

    back(){
        this.timestamp -= 1;
        return this.timestamp;
    }

    reset(){
        this.timestamp = -1;
    }
}

class PlaybackController {
    constructor(){
        this.dataProvider = new RemoteImageDataProvider("ws://127.0.0.1:8080/ws", "test_images");
        this.playback = new Playback();
        this.handle = null;
        this.waitResponse = false;
        this.isStreaming = false;
    }

    seek(timestamp) {
        this.playback.seek(timestamp);
    }

    on(func) {
        this.dataProvider.on((data) => {
            this.waitResponse = false;
            if(this.isStreaming){
                this.playback.next();
            }

            func(data);
        });
    }

    startStream(){
        this.isStreaming = true;
        this.dataProvider.getMessage("StreamImage", this.playback.next());
    }
    
    stopStream(){
        this.isStreaming = false;
        this.dataProvider.getMessage("StopStreamImage", this.playback.next());
    }

    _animate(){
        if(this.handle !== null){
            cancelAnimationFrame(this.handle);
            this.handle = null;
        }
        
        this.handle = requestAnimationFrame(() => {
            this._animate();
        });
        
        if(this.waitResponse === false){
            this.waitResponse = true;
            this.dataProvider.getMessage("Image", this.playback.next());
        }
    }

    play() {
        if(this.handle === null){
            this._animate();
        } else {
            cancelAnimationFrame(this.handle);
            this.handle = null;
            this.waitResponse = false;
        }
    }

    step(){
        this.dataProvider.getMessage("Image", this.playback.next());
    }

    back(){
        this.dataProvider.getMessage("Image", this.playback.back());
    }

}

function ImagePlaybackControll(props) {
    const [isStreaming, setIsStreaming] = useState(false);
    const canvasEl = useRef(null);
    const worker = useRef(null);
    const ctrl = useRef(props.playbackCtrl);

    useEffect(() => {
        worker.current = new Worker();
        const offscreen = canvasEl.current.transferControlToOffscreen();
        worker.current.postMessage({type: "initialize", canvas: offscreen}, [offscreen]);
        ctrl.current.seek(1);

        ctrl.current.on((data) => {
            worker.current.postMessage({type: "renderImage", data: data});
        });

    }, []);

   return (
    <>
    {isStreaming
        ? <button onClick={() => {ctrl.current.stopStream(); setIsStreaming(false)}}>stop</button>
        : <button onClick={() => {ctrl.current.startStream(); setIsStreaming(true)}}>stream</button>}
    <button onClick={() => ctrl.current.play()}>play</button>
    <button onClick={() => ctrl.current.seek(1)}>reset</button>
    <button onClick={() => ctrl.current.step()}>step</button>
    <button onClick={() => ctrl.current.back()}>back</button>
    <canvas ref={canvasEl}></canvas>
    </>
);

}

function App() {
    const playbackCtrl = useRef(new PlaybackController());

    return (
        <div>
        <LoadState />
        <RequestType1 />
        <ImagePlaybackControll playbackCtrl={playbackCtrl.current} />
        </div>
    );
}

ReactDOM.render(
  <App />,
  document.getElementById("root")  
);



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

/*
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


*/

