import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext } from 'react';
import ReactDOM, { render } from 'react-dom';

import {MessageSampleView, MessageSampleControlView} from '@/components/MessageSample.js';
import {LineChartView, LineChartControlView}  from '@/components/LineChart.js';
import {ImageDataView, ImageDataControlView} from '@/components/ImageData.js';
import {WorldView} from '@/components/World.js';
import {StateContext, reducer, initialState} from '@/StateContext.js';


function MainView(props) {
    const { state, dispatch } = useContext(StateContext);

    console.log("MainView");
    console.log(state.playbackCtrl.isPlaying);

    useEffect(() => {
        return () => {
            console.log("detach");
        }
    }, []);

    return (
        <div>
        <button onClick={() => state.playbackCtrl.next()}>STEP WORLD</button>
        {state.playbackCtrl.isPlaying 
           ? <button onClick={() => dispatch({type: 'playbackCtrl/stop'})}>STOP WORLD</button>
           : <button onClick={() => dispatch({type: 'playbackCtrl/start'})}>PLAY WORLD</button>
        }
        <WorldView ctrl={state.worldCtrl}/>
        <div style={{display: 'flex', width: '100%'}}>
        <LineChartView ctrl={state.lineChartCtrl} />
        <LineChartControlView />
        <MessageSampleView ctrl={state.messageSampleCtrl} />
        <MessageSampleControlView />
        </div>
        <ImageDataView ctrl={state.imageDataCtrl} />
        <ImageDataControlView />

        </div>
    );
}

function ControlView(props){
    return (<div />);
}

function App(props) {
    const [state, dispatch] = useReducer(reducer, initialState);
    console.log("App");

    return (
        <StateContext.Provider value={{state, dispatch}}>
        {state.mainView
            ? <button onClick={() => dispatch({type: 'mainView', value: false})}>Setting</button>
            : <button onClick={() => dispatch({type: 'mainView', value: true})}>Main</button>}
        {state.mainView
            ? <MainView />
            : <ControlView store={state} />}
        </StateContext.Provider>
    );
}


function load(){
    ReactDOM.render(
        <App />,
        document.getElementById("root")  
    );
}

load();