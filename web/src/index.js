import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext, useMemo } from 'react';
import ReactDOM, { render } from 'react-dom';

import {MessageSampleView, MessageSampleControllerView} from 'components/MessageSample.js';
import {LineChartView, LineChartControllerView}  from 'components/LineChart.js';
import {ImageDataView, ImageDataControllerView} from 'components/ImageData.js';
import {WorldView} from 'components/World.js';
import {AppContext, AppContextReducer, createAppContext} from 'StateContext.js';

const appContextValue = createAppContext();

const MainControlContext = createContext();
let mainControlContextValue = createMainControlContext(appContextValue.playbackController, appContextValue.messageSender);

function createMainControlContext(playbackController, messageSender) {
    return {
        playbackController: playbackController,
        messageSender: messageSender,
        capture: false,
        realtime: true    
    };
}

const MainControlReducer = (state, action) => {
    switch(action.type) {
        case 'PLAY':
            state.playbackController.start();
            return Object.assign({}, state);
        case 'STEP':
            state.playbackController.next();
            return Object.assign({}, state);
        case 'STOP':
            state.playbackController.stop();
            return Object.assign({}, state);
        case 'CAPTURE':
            state.messageSender.sendData("Status/Capture", {enable: action.enable});
            return Object.assign({}, state, {capture: action.enable});    
        case 'REALTIME':
            state.messageSender.sendData("Status/Realtime", {enable: action.enable});
            return Object.assign({}, state, {realtime: action.enable});    
    }
    return Object.assign({}, state);
};

function MainControl() {
    const { state, dispatch } = useContext(MainControlContext);

    return useMemo(() => {
    console.log("MainControls");
    return (
        <>
        <input type="checkbox" id="capture" checked={state.capture} onChange={() => dispatch({type: "CAPTURE", enable: !state.capture})}></input>
        <label htmlFor="capture">Capture</label>
        <input type="checkbox" id="realtime" checked={state.realtime} onChange={() => dispatch({type: "REALTIME", enable: !state.realtime})}></input>
        <label htmlFor="realtime">Realtime</label>
        <button onClick={() => dispatch({type:"STEP"})}>STEP WORLD</button>
        {state.playbackController.isPlaying 
           ? <button onClick={() => dispatch({type:"STOP"})}>STOP WORLD</button>
           : <button onClick={() => dispatch({type:"PLAY"})}>PLAY WORLD</button>
        }
        </>
    );
    }, [state]);    
}

function MainView(props) {
    const { state } = useContext(AppContext);

    console.log("MainView");
    console.log(state.playbackController.isPlaying);

    useEffect(() => {
        return () => {
            console.log("detach");
        }
    }, []);


    return (
        <div>
        <MainControl />
        <WorldView controller={state.worldController} />
        <div style={{display: 'flex', width: '100%'}}>
        <LineChartView controller={state.lineChartController} />
        <LineChartControllerView controller={state.lineChartController} />
        <MessageSampleView controller={state.messageSampleController} />
        <MessageSampleControllerView controller={state.messageSampleController} />
        </div>
        </div>
    );
}



function ControlView(props){
    const { state, dispatch } = useContext(AppContext);

    const executeCommand = (command) => {
        state.commandExecuter.sendData(command, {});
    };

    return (
        <div>
            <button onClick={() => executeCommand("Command/Test")}>Command/Test</button>

            <ImageDataView controller={state.imageDataController} />
            <ImageDataControllerView controller={state.imageDataController} />

        </div>
    );
}


function MainPanel(props) {
    return (
        <div>
        {props.children}
        </div>
    );
}

function App(props) {
    const [state, dispatch] = useReducer(AppContextReducer, appContextValue);
    const [mainControlContext, mainControlReducer] = useReducer(MainControlReducer, mainControlContextValue);

    const [mainView, setMainView] = useState(true);


    console.log("App");
    
    return (
        <AppContext.Provider value={{state, dispatch}}>
        <MainControlContext.Provider value={{state: mainControlContext, dispatch: mainControlReducer}} >
        <MainPanel key={state.appID} >
            { state.error && <div>state.error.message</div> }
            <button onClick={() => dispatch({type: 'RESET'})}>RESET</button>
            {mainView
                ? <button onClick={() => setMainView(false)}>Setting</button>
                : <button onClick={() => setMainView(true)}>Main</button>}
            {mainView
                ? <MainView />
                : <ControlView />}
        </MainPanel>
        </MainControlContext.Provider>
        </AppContext.Provider>
    );
}


ReactDOM.render(
    <App />,
    document.getElementById("root")  
);
