import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';

export function ImageDataView(props) {
    const canvasEl = useRef();
    // https://stackoverflow.com/questions/30296341/rendering-returning-html5-canvas-in-reactjs
    useEffect(() => {
        canvasEl.current.appendChild(props.controller.canvas);
    }, [props.controller]);

    return (
        <div ref={canvasEl} />
    );
}

function StreamButton(props) {
    const [isStreaming, setIsStreaming] = useState(props.controller.isStreaming);

    const startStream = () => {
        props.controller.startStream();
        setIsStreaming(props.controller.isStreaming);
    }
    
    const stopStream = () => {
        props.controller.stopStream();
        setIsStreaming(props.controller.isStreaming);
    }

    return (
        <>
        {isStreaming
            ? <button onClick={() => stopStream()}>stop</button>
            : <button onClick={() => startStream()}>stream</button>}
        </>
    );
}

function PlayButton(props){
    const [isPlaying, setIsPlaying] = useState(props.controller.playback.isPlaying);
    console.log("PlayButton");

    const start = () => {
        props.controller.start();
        setIsPlaying(props.controller.playback.isPlaying);
    }
    
    const stop = () => {
        props.controller.stop();
        setIsPlaying(props.controller.playback.isPlaying);
    }
    
    return (
        <>
        {isPlaying
            ? <button onClick={() => stop()}>stop</button>
            : <button onClick={() => start()}>play</button>}        
        </>
    );
}

export function ImageDataControllerView(props) {

    return (
        <div>
        <StreamButton controller={props.controller} />
        <PlayButton controller={props.controller} />
        <button onClick={() => props.controller.seek(1)}>reset</button>
        <button onClick={() => props.controller.step()}>step</button>
        <button onClick={() => props.controller.back()}>back</button>
        </div>
        );    
}
