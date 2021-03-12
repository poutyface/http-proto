import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import {StateContext} from 'StateContext.js';

export function LineChartView(props) {
    const canvasEl = useRef();

    useEffect(() => {
        canvasEl.current.appendChild(props.controller.canvas);
    }, [props.controller]);

    return useMemo(() => {
        console.log("LineChartView");
        return (
            <div ref={canvasEl} style={{ display: "flex", width: "100%"}} />
        );
    }, [props.controller]);
}


export function LineChartControllerView(props) {
    return useMemo(() => {
        console.log("LineChartControllView");
        return (
            <button onClick={() => { props.controller.getMessage() }}>Get</button>
        );
    }, [props.controller]);
}
