import React, { useState, useEffect, useRef, useContext, createElement} from 'react';
import {StateContext} from '@/StateContext.js';

export function MessageSampleView(props) {
    const textAreaEl = useRef();

    useEffect(() => {
        textAreaEl.current.appendChild(props.ctrl.textarea);
    }, []);

    return (
        <div ref={textAreaEl} />
    );
}

export function MessageSampleControlView(props) {
    const { state } = useContext(StateContext);
    return (
        <div>
        <button onClick={() => state.messageSampleCtrl.getMessage("type1")}>Type1: Tx:JSON, Rx:JSON</button>        
        <button onClick={() => state.messageSampleCtrl.getMessage("Position")}>Type2: position Tx:JSON, Rx:Proto</button>
        <button onClick={() => state.messageSampleCtrl.getMessage("Status")}>Type3: status Tx:JSON, Rx:Proto</button>
        <button onClick={() => state.messageSampleCtrl.getMessage("")}>All</button>
        </div>
    );
}
