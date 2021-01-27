import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import {StateContext} from '@/StateContext.js';

export function LineChartView(props) {
    const canvasEl = useRef();

    useEffect(() => {
        canvasEl.current.appendChild(props.ctrl.canvas);
    }, []);

    return (
        <div ref={canvasEl} style={{ display: "flex", width: "100%"}} />
    );
}


export function LineChartControlView(props) {
    const { state } = useContext(StateContext);
    return (
        <button onClick={() => { state.lineChartCtrl.getMessage() }}>Get</button>
    );
}
