import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {StateContext} from 'StateContext.js';

export function LineChartView(props) {
    const canvasEl = useRef();

    useEffect(() => {
        canvasEl.current.appendChild(props.controller.canvas);
    }, [props.controller]);

    return (
        <div ref={canvasEl} style={{ display: "flex", width: "100%"}} />
    );
}


export function LineChartControllerView(props) {
    return (
        <button onClick={() => { props.controller.getMessage() }}>Get</button>
    );
}
