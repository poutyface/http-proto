import { WebsocketEndpoint } from './websocket_endpoint.js';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactDOM, { render } from 'react-dom';
import {MessageSampleView, MessageSampleControlView, MessageSampleControl, StateControl} from './MessageSample.js';
import {LineChartView, LineChartControlView, LineChartControl}  from './LineChart.js';
import {ImageDataView, ImageDataControl, ImageDataControlView, RemoteImageDataProvider} from './ImageData.js';
import {PlaybackControl} from './Playback.js';
import * as THREE from 'three';




function WorldView(props) {
    const canvasEl = useRef();
    const ctrl = props.ctrl;
    console.log(ctrl);

    useEffect(() => {
        canvasEl.current.appendChild(ctrl.renderer.canvas);
    }, []);

    return (
        <div ref={canvasEl} />
    );
}

class WorldRenderer {
    constructor(){
        this.canvas = document.createElement('canvas');
        this.width = 600;
        this.height = 300;

        this.mouse = new THREE.Vector2(0, 0);
        this.canvas.addEventListener('mousemove', (event) => {
            event.preventDefault();
            const x = event.clientX - this.canvas.getBoundingClientRect().left;
            const y = event.clientY - this.canvas.getBoundingClientRect().top;
            this.mouseMoved(x, y);
            //console.log(`mouse in canvas: ${x} ${y}`);
        });
        this.canvas.addEventListener('wheel', (event) => {
            event.preventDefault();
            const deltaX = event.deltaX;
            const deltaY = event.deltaY;
            this.mouseWheeled(deltaX, deltaY);
        });

        this.renderer = new THREE.WebGLRenderer({canvas: this.canvas});
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        
        // camera
        const FOV = 60;
        const camera_distance = (this.height/2) / Math.tan((FOV/2)*(Math.PI/180));

        this.camera = new THREE.PerspectiveCamera(FOV, this.width/this.height, 1, camera_distance * 2);
        this.camera.position.z = camera_distance;
        
        console.log(`render: canvas w:${this.canvas.width} h:${this.canvas.height}`);
        console.log(`render: camera pos ${this.camera.position.x} ${this.camera.position.y} ${this.camera.position.z}`);

        this.scene = new THREE.Scene();
        
        // light 
        this.light = new THREE.PointLight(0x00ffff);
        this.light.position.set(0, 0, 400);
        this.scene.add(this.light);

        // geometory
        const geo = new THREE.BoxGeometry(100,100,100);
        const mat = new THREE.MeshLambertMaterial({color: 0xffffff});
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.rotation.x = Math.PI / 4;
        this.mesh.rotation.y = Math.PI / 4;
        this.scene.add(this.mesh);

        this.renderer.render(this.scene, this.camera);
    }

    update(data){
        this.mesh.rotation.x += 0.01;
        this.mesh.rotation.y += 0.01;

        /*
        this.mesh.position.x = data.position.x;
        this.mesh.position.y = data.position.y;
        this.mesh.position.z = data.position.z;
        */
        //console.log(data);

        this.renderer.render(this.scene, this.camera);
    }

    mouseMoved(x, y){
        this.mouse.x = x - (this.width / 2);
        this.mouse.y = -y + (this.height / 2);

        this.light.position.x = this.mouse.x;
        this.light.position.y = this.mouse.y;
    }

    mouseWheeled(deltaX, deltaY){
        if(deltaY < 0){
            this.camera.position.z += 10.0;
        } else {
            this.camera.position.z -= 10.0;
        }
        this.renderer.render(this.scene, this.camera);

        //console.log(`${deltaX}, ${deltaY}`);
        //console.log(`render: camera pos ${this.camera.position.x} ${this.camera.position.y} ${this.camera.position.z}`);

    }
}

class WorldControl {
    constructor(){
        this.renderer = new WorldRenderer();
    }

    update(data){
        this.renderer.update(data);
    }
}


function MainView(props) {
    const modules = props.store.modules;
    const [isPlaying, setIsPlaying] = useState(modules.playbackCtrl.isPlaying);

    console.log("App");
    console.log(isPlaying);

    useEffect(() => {
        return () => {
            console.log("detach");
        }
    }, []);

    const play = () => {
        modules.playbackCtrl.start();
        setIsPlaying(true);
    }

    const stop = () => {
        modules.playbackCtrl.stop();
        setIsPlaying(false);
    };

    const step = () => {
        modules.playbackCtrl.next();
    }
    
    return (
        <div>
        <button onClick={() => {step()}}>STEP WORLD</button>
        {isPlaying 
           ? <button onClick={() => {stop()}}>STOP WORLD</button>
           : <button onClick={() => {play()}}>PLAY WORLD</button>
        }
        <WorldView ctrl={modules.worldCtrl} />
        <div style={{display: 'flex', width: '100%'}}>
        <LineChartView ctrl={modules.lineChartCtrl} />
        <LineChartControlView ctrl={modules.lineChartCtrl} />
        <MessageSampleView ctrl={modules.messageSampleCtrl} />
        <MessageSampleControlView ctrl={modules.messageSampleCtrl} />
        </div>
        <ImageDataView ctrl={modules.imageDataCtrl} />
        <ImageDataControlView ctrl={modules.imageDataCtrl} />

        </div>
    );
}

function ControlView(props){
    return (<div />);
}

function App(props) {
    const [mainView, setMainView] = useState(true);

    return (
        <>
        {mainView
            ? <button onClick={() => {setMainView(false)}}>Setting</button>
            : <button onClick={() => {setMainView(true)}}>Main</button>}
        {mainView
            ? <MainView store={props.store} />
            : <ControlView stor={props.stor} />}
        </>
    );
}

function load(){
    const dataProvider = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
    const lineChartCtrl = new LineChartControl('ChartPosition', 'timestamp', 'pos', dataProvider);
    const messageSampleCtrl = new MessageSampleControl(dataProvider);

    const imageDataProvider = new RemoteImageDataProvider("ws://127.0.0.1:8080/ws", "test_images");
    const imageDataCtrl = new ImageDataControl(imageDataProvider);
    imageDataCtrl.seek(1);
    imageDataCtrl.scale = 0.5;

    const worldCtrl = new WorldControl();

    const stateCtrl = new StateControl(dataProvider);
    stateCtrl.on((data) => {
        const state = data.state;
        if(state.position){
            messageSampleCtrl.update(state.position);
        }

        if(state.status){
            messageSampleCtrl.update(state.status);
        }

        if(state.chartData){
            lineChartCtrl.update(state.chartData);
        }

        worldCtrl.update(state);
    });

    const playbackCtrl = new PlaybackControl();
    playbackCtrl.seek(1);
    playbackCtrl.on((timestamp) => {
        //lineChartCtrl.current.setTimestamp(timestamp.current);
        //messageSampleCtrl.current.setTimestamp(timestamp.current);
        imageDataCtrl.seek(timestamp);
        stateCtrl.setTimestamp(timestamp);
        
        //lineChartCtrl.current.getMessage();
        //messageSampleCtrl.current.getMessage();
        imageDataCtrl.step();
        stateCtrl.getMessage();
    });


    const store = {
        timestamp: 1,
        modules :{
            playbackCtrl: playbackCtrl,
            lineChartCtrl: lineChartCtrl,
            messageSampleCtrl: messageSampleCtrl,
            imageDataCtrl: imageDataCtrl,
            worldCtrl: worldCtrl,
            stateCtrl: stateCtrl,
        },
        hmi: {},
    };

    ReactDOM.render(
        <App store={store} />,
        document.getElementById("root")  
    );
}

load();