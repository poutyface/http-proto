
import React, { createContext } from 'react';

import { MessageSampleController, MessageController } from 'lib/MessageSample.js';
import { LineChartController }  from 'lib/LineChart.js';
import { ImageDataController, RemoteImageDataProvider } from 'lib/ImageData.js';
import { PlaybackController } from 'lib/Playback.js';
import { WorldController } from 'lib/World.js';
import { WebsocketEndpoint } from 'lib/websocket_endpoint.js';

const config = {
    stateServiceURI: 'ws://127.0.0.1:4567/ws',
    imageServiceURI: 'ws://127.0.0.1:4567/image_service',
    imageResource: 'test_images',
};


export const createAppContext = () => {
    const dataProvider = new WebsocketEndpoint(config.stateServiceURI);
    try{
        dataProvider.connect();
    } catch(error) {
        return {
            appID: 0,
            error: error,
        };
    }

    const commandExecuter = dataProvider;

    const messageSender = dataProvider;

    const lineChartController = new LineChartController('Status/ChartPosition', 'timestamp', 'pos', dataProvider);
    const messageSampleController = new MessageSampleController(dataProvider);

    const imageDataProvider = new RemoteImageDataProvider(config.imageServiceURI, config.imageResource);
    try{
        imageDataProvider.connect();
    } catch(error){
        return {
            appID: 0,
            error: error,
        };
    }

    window.onbeforeunload = (event) => {
        console.log("onbeforeunload");
        dataProvider.close();
        imageDataProvider.close();
    };

    const imageDataController = new ImageDataController(imageDataProvider);
    imageDataController.seek(1);
    imageDataController.scale = 0.5;

    const worldController = new WorldController();
    
    const statusController = new MessageController('Status/Status', dataProvider);
    statusController.on((inbox) => {
        const status = inbox.status;
        //console.log(inbox);
        if(status.position){
            messageSampleController.update(status.position);
        }

        if(status.debug){
            messageSampleController.update(status.debug);
        }

        if(status.chartData){
            lineChartController.update(status.chartData);
        }

        worldController.update(status);
    });
    
    const playbackController = new PlaybackController();
    playbackController.seek(1);
    playbackController.on((timestamp) => {
        //lineChartCtrl.current.setTimestamp(timestamp.current);
        //messageSampleCtrl.current.setTimestamp(timestamp.current);
        imageDataController.seek(timestamp);
        statusController.setTimestamp(timestamp);
        
        //lineChartCtrl.current.getMessage();
        //messageSampleCtrl.current.getMessage();
        imageDataController.step();
        statusController.getMessage();
    });

    return {
        appID: 0,
        error: null,
        mainView: true,
        playbackController,
        lineChartController,
        messageSampleController,
        imageDataController,
        worldController,
        statusController,
        commandExecuter,
        messageSender,
        captureMode: false,
        realtime: true,
        hmi: {
        },
    };    
}


const reset = (state) => {
    state.playbackController.reset();
    state.playbackController.seek(0);
    
    state.imageDataController.reset();
    state.imageDataController.seek(0);
};

export const AppContext = createContext();

export const AppContextReducer = (state, action) => {
    switch(action.type) {
        case 'ERROR':
            return Object.assign({}, state, {error: action.error});
        case 'RESET':
            const newState = Object.assign({}, state, {appID: state.appID + 1});
            reset(newState);
            return newState;
    }

    return Object.assign({}, state);
};


