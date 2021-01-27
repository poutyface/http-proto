import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {StateContext} from '@/StateContext.js';

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
    const { state, dispatch } = useContext(StateContext);

    return (
        <div>
        {state.imageDataCtrl.isStreaming
            ? <button onClick={() => dispatch({type: 'imageDataCtrl/stopStream'})}>stop</button>
            : <button onClick={() => dispatch({type: 'imageDataCtrl/startStream'})}>stream</button>}
        {state.imageDataCtrl.playback.isPlaying
            ? <button onClick={() => dispatch({type: 'imageDataCtrl/stop'})}>stop</button>
            : <button onClick={() => dispatch({type: 'imageDataCtrl/start'})}>play</button>}        
        <button onClick={() => state.imageDataCtrl.seek(1)}>reset</button>
        <button onClick={() => state.imageDataCtrl.step()}>step</button>
        <button onClick={() => state.imageDataCtrl.back()}>back</button>
        </div>
        );    
}
