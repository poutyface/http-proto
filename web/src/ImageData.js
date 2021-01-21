import React, { useState, useEffect, useRef, useCallback } from 'react';
import {Playback, PlaybackControl} from './Playback.js';
import { WebsocketEndpoint } from './websocket_endpoint.js';
import Worker from './image_canvas.worker.js';


export class RemoteImageDataProvider {
    constructor(address, resource){
        this.address = address;
        this.resource = resource;
        this.ws = new WebsocketEndpoint(this.address);
        this.cacheStore = {};
        this.handler = null;
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

export class ImageDataControl {
    constructor(dataProvider){
        this.dataProvider = dataProvider;
        this.playback = new PlaybackControl();
        this.isStreaming = false;
        this.scale = 1.0;
        this.handler = null;

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

    play() {
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


export function ImageDataView(props) {
    const canvasEl = useRef();
    // https://stackoverflow.com/questions/30296341/rendering-returning-html5-canvas-in-reactjs
    useEffect(() => {
        canvasEl.current.appendChild(props.ctrl.canvas);
    }, []);

    return (
        <div ref={canvasEl} />
    );
}

export function ImageDataControlView(props) {
    const ctrl = props.ctrl;
    const [isStreaming, setIsStreaming] = useState(ctrl.isStreaming);
    const [isPlaying, setIsPlaying] = useState(ctrl.playback.isPlaying);
 
    return (
        <div>
        {isStreaming
            ? <button onClick={() => {ctrl.stopStream(); setIsStreaming(ctrl.isStreaming); }}>stop</button>
            : <button onClick={() => {ctrl.startStream(); setIsStreaming(ctrl.isStreaming); }}>stream</button>}
        {isPlaying
            ? <button onClick={() => {ctrl.stop(); setIsPlaying(ctrl.playback.isPlaying); }}>stop</button>
            : <button onClick={() => {ctrl.play(); setIsPlaying(ctrl.playback.isPlaying); }}>play</button>}        
        <button onClick={() => ctrl.seek(1)}>reset</button>
        <button onClick={() => ctrl.step()}>step</button>
        <button onClick={() => ctrl.back()}>back</button>
        </div>
        );    
}
