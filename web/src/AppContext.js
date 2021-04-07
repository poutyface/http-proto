
import React, { createContext } from 'react';
import { StringListStream, MessageBroker, MessageStreamBuffer } from 'lib/MessageSample.js';
import { RemoteImageDataProvider } from 'lib/ImageData.js';
import { WebsocketEndpoint } from 'lib/websocket_endpoint.js';
import { createRequest, protobufRoot } from 'lib/utils.js';


const config = {
    stateServiceURI: 'ws://127.0.0.1:4567/ws',
    imageServiceURI: 'ws://127.0.0.1:4567/image_service',
};


export const createAppContext = () => {
    const dataProvider = new WebsocketEndpoint(config.stateServiceURI);
    dataProvider.connect();

    const imageService = new WebsocketEndpoint(config.imageServiceURI);
    imageService.connect();

    const imageDataProvider = new RemoteImageDataProvider(imageService);

    const imageDataStreamProvider = new RemoteImageDataProvider(imageService);

    const streamBuffer = new MessageStreamBuffer();

    const messageBrokers = {
        any: new MessageBroker(),
        status: new MessageBroker(),
    };
    
    const stringListStream = {
        any: new StringListStream(),
    };
    
    const commandExecuter = dataProvider;
 
    // websocket close
    window.onbeforeunload = (event) => {
        console.log("onbeforeunload");
        dataProvider.close();
        imageService.close();
    };


    return {
        appID: 0,
        error: null,
        page: "Main",
        live: true,
        record: true,
        dataProvider,
        imageDataProvider,
        imageDataStreamProvider,
        streamBuffer,
        messageBrokers,
        stringListStream,
        commandExecuter,
    };    
}


const reset = (state) => {
    state.imageDataProvider.clear();
    state.imageDataStreamProvider.clear();
};

export const AppContext = createContext();

export const AppContextReducer = (state, action) => {
    switch(action.type) {
        case 'PAGE':
            return Object.assign({}, state, {page: action.page});
        case 'ERROR':
            return Object.assign({}, state, {error: action.error});
        case 'RESET':
            const newState = Object.assign({}, state, {appID: state.appID + 1});
            reset(newState);
            return newState;
        case 'RECORD':
            var message = createRequest(protobufRoot.lookupType("RequestCommandRecord"), {enable: action.enable});
            state.commandExecuter.sendMessage(message);
            return Object.assign({}, state, {record: action.enable});    
        case 'LIVE':
            var message = createRequest(protobufRoot.lookupType("RequestStatusLive"), {enable: action.enable});
            state.dataProvider.sendMessage(message);
            return Object.assign({}, state, {live: action.enable});
    }

    return Object.assign({}, state);
};


