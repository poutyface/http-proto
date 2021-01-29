
import React, { createContext, useContext } from 'react';

import { MessageSampleController, StateController } from 'lib/MessageSample.js';
import { LineChartController }  from 'lib/LineChart.js';
import { ImageDataController, RemoteImageDataProvider } from 'lib/ImageData.js';
import { PlaybackController } from 'lib/Playback.js';
import { WorldController } from 'lib/World.js';
import { WebsocketEndpoint } from 'lib/websocket_endpoint.js';

export const StateContext = createContext();

const config = {
    stateServiceURI: 'ws://127.0.0.1:4567/ws',
    imageServiceURI: 'ws://127.0.0.1:4567/image_service',
    imageResource: 'test_images',
};


export const createInitialState = () => {
    const dataProvider = new WebsocketEndpoint(config.stateServiceURI);
    try{
        dataProvider.connect();
    } catch(error) {
        return {
            appID: 0,
            error: error,
        };
    }

    const lineChartController = new LineChartController('ChartPosition', 'timestamp', 'pos', dataProvider);
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
    const imageDataController = new ImageDataController(imageDataProvider);
    imageDataController.seek(1);
    imageDataController.scale = 0.5;

    const worldController = new WorldController();
    
    const stateController = new StateController(dataProvider);
    stateController.on((data) => {
        const state = data.state;
        if(state.position){
            messageSampleController.update(state.position);
        }

        if(state.status){
            messageSampleController.update(state.status);
        }

        if(state.chartData){
            lineChartController.update(state.chartData);
        }

        worldController.update(state);
    });
    
    const playbackController = new PlaybackController();
    playbackController.seek(1);
    playbackController.on((timestamp) => {
        //lineChartCtrl.current.setTimestamp(timestamp.current);
        //messageSampleCtrl.current.setTimestamp(timestamp.current);
        imageDataController.seek(timestamp);
        stateController.setTimestamp(timestamp);
        
        //lineChartCtrl.current.getMessage();
        //messageSampleCtrl.current.getMessage();
        imageDataController.step();
        stateController.getMessage();
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
        stateController,
        hmi: {},
    };    
}

export const initialState = createInitialState();

const reset = (state) => {
    state.playbackController.reset();
    state.playbackController.seek(1);
    
    state.imageDataController.reset();
    state.imageDataController.seek(1);
};


export const reducer = (state, action) => {
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


