import React, { useState, useMemo, useEffect, useRef, useCallback, useContext } from 'react';

export function ImageDataView(props) {
    const {
        controller,
    } = props;

    const canvasEl = useRef();
    // https://stackoverflow.com/questions/30296341/rendering-returning-html5-canvas-in-reactjs
    useEffect(() => {
        canvasEl.current.appendChild(controller.canvas);

        return (() => {
            // call controller drop func
        });
    }, []);

    return useMemo(() => {
        console.log("ImageDataView");
        return (
            <div ref={canvasEl} />
        );
    }, []);
}

export function StreamButton(props) {
    const {
        controller,
    } = props;

    const [isStreaming, setIsStreaming] = useState(controller.isStreaming);

    const startStream = () => {
        setIsStreaming(controller.startStream())
    }
    
    const stopStream = () => {
        setIsStreaming(controller.stopStream());
    }

    return useMemo(() => {
        console.log("StreamButton");
        return (
            <>
            {isStreaming
                ? <button onClick={() => stopStream()}>stop</button>
                : <button onClick={() => startStream()}>stream</button>}
            </>
            );
    }, [isStreaming]);
}

