
import React, { createContext, useContext } from 'react';

import { MessageSampleControl, StateControl } from '@/lib/MessageSample.js';
import { LineChartControl }  from '@/lib/LineChart.js';
import { ImageDataControl, RemoteImageDataProvider } from '@/lib/ImageData.js';
import { PlaybackControl } from '@/lib/Playback.js';
import { WorldControl } from '@/lib/World.js';
import { WebsocketEndpoint } from '@/lib/websocket_endpoint.js';

export const StateContext = createContext();

export const reducer = (state, action) => {
    switch(action.type) {
        case 'mainView':
            return Object.assign({}, state, {mainView: action.value});
        case 'playbackCtrl/start':
            state.playbackCtrl.start(); break;
        case 'playbackCtrl/stop':
            state.playbackCtrl.stop(); break;
        case 'imageDataCtrl/start':
            state.imageDataCtrl.start(); break;
        case 'imageDataCtrl/stop':
            state.imageDataCtrl.stop(); break;
        case 'imageDataCtrl/startStream':
            state.imageDataCtrl.startStream(); break;
        case 'imageDataCtrl/stopStream':
            state.imageDataCtrl.stopStream(); break;
    }

    return Object.assign({}, state);
};


const createInitialState = () => {
    const dataProvider = new WebsocketEndpoint("ws://127.0.0.1:8080/ws");
    const lineChartCtrl = new LineChartControl('ChartPosition', 'timestamp', 'pos', dataProvider);
    const messageSampleCtrl = new MessageSampleControl(dataProvider);

    const imageDataProvider = new RemoteImageDataProvider("ws://127.0.0.1:8080/image_service", "test_images");
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


    return {
        timestamp: 1,
        mainView: true,
        playbackCtrl: playbackCtrl,
        lineChartCtrl: lineChartCtrl,
        messageSampleCtrl: messageSampleCtrl,
        imageDataCtrl: imageDataCtrl,
        worldCtrl: worldCtrl,
        stateCtrl: stateCtrl,
        hmi: {},
    };    
}

export const initialState = createInitialState();


