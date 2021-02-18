import React, { useState, useEffect, useRef, useContext, createElement} from 'react';

export function MessageSampleView(props) {
    const textAreaEl = useRef();

    useEffect(() => {
        textAreaEl.current.appendChild(props.controller.textarea);
    }, [props.controller]);

    return (
        <div ref={textAreaEl} />
    );
}

export function MessageSampleControllerView(props) {
    return (
        <div>
        <button onClick={() => props.controller.getMessage("type1")}>Type1: Tx:JSON, Rx:JSON</button>        
        <button onClick={() => props.controller.getMessage("Position")}>Type2: position Tx:JSON, Rx:Proto</button>
        <button onClick={() => props.controller.getMessage("Debug")}>Type3: status Tx:JSON, Rx:Proto</button>
        <button onClick={() => props.controller.getMessage("")}>All</button>
        </div>
    );
}
