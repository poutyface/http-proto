import React, { useState, useMemo, useEffect, useRef, useContext, createElement} from 'react';

export function MessageSampleView(props) {
    const textAreaEl = useRef();

    useEffect(() => {
        textAreaEl.current.appendChild(props.controller.textarea);
    }, [props.controller]);

    return useMemo(() => {
        console.log("MessageSampleView");
        return (
            <div ref={textAreaEl} />
        );
    }, [props.controller]);
}

export function MessageSampleControllerView(props) {
    return useMemo(() => {
        console.log("MessageSampleControllerView");
        return (
            <div>
            <button onClick={() => props.controller.getMessage("Status/type1")}>Type1: Tx:JSON, Rx:JSON</button>        
            <button onClick={() => props.controller.getMessage("Status/Position")}>Type2: position Tx:JSON, Rx:Proto</button>
            <button onClick={() => props.controller.getMessage("Status/Debug")}>Type3: status Tx:JSON, Rx:Proto</button>
            <button onClick={() => props.controller.getMessage("")}>All</button>
            </div>
        );
    }, [props.controller]);
}
