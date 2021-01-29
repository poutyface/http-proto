import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext } from 'react';
import ReactDOM, { render } from 'react-dom';

import {MessageSampleView, MessageSampleControllerView} from 'components/MessageSample.js';
import {LineChartView, LineChartControllerView}  from 'components/LineChart.js';
import {ImageDataView, ImageDataControllerView} from 'components/ImageData.js';
import {WorldView} from 'components/World.js';
import {StateContext, reducer, initialState} from 'StateContext.js';


function MainControls(props) {
    const [isPlaying, setIsPlaying] = useState(props.controller.isPlaying);

    const play = () => {
        props.controller.start();
        setIsPlaying(props.controller.isPlaying);
    };

    const stop = () => {
        props.controller.stop();
        setIsPlaying(props.controller.isPlaying);
    };

    return (
        <>
        <button onClick={() => props.controller.next()}>STEP WORLD</button>
        {isPlaying 
           ? <button onClick={() => stop()}>STOP WORLD</button>
           : <button onClick={() => play()}>PLAY WORLD</button>
        }
        </>
    );    
}

function MainView(props) {
    const { state, dispatch } = useContext(StateContext);

    console.log("MainView");
    console.log(state.playbackController.isPlaying);

    useEffect(() => {
        return () => {
            console.log("detach");
        }
    }, []);

    const play = () => {
        state.playbackController.start();
        setIsPlaying(state.playbackController.isPlaying);
    };

    const stop = () => {
        state.playbackController.stop();
        setIsPlaying(state.playbackController.isPlaying);
    };

    return (
        <div>
        <MainControls controller={state.playbackController} />
        <WorldView controller={state.worldController} />
        <div style={{display: 'flex', width: '100%'}}>
        <LineChartView controller={state.lineChartController} />
        <LineChartControllerView controller={state.lineChartController} />
        <MessageSampleView controller={state.messageSampleController} />
        <MessageSampleControllerView controller={state.messageSampleController} />
        </div>
        <ImageDataView controller={state.imageDataController} />
        <ImageDataControllerView controller={state.imageDataController} />

        </div>
    );
}

function ControlView(props){
    return (<div />);
}


function MainPanel(props) {
    return (
        <div>
        {props.children}
        </div>
    );
}

function App(props) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const [mainView, setMainView] = useState(true);


    console.log("App");
    
    return (
        <StateContext.Provider value={{state, dispatch}}>
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
        </StateContext.Provider>
    );
}


ReactDOM.render(
    <App />,
    document.getElementById("root")  
);
