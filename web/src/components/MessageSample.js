import React, { useState, useMemo, useEffect, useRef } from 'react';

export function DisplayView(props){
    const {
        stringListStream
    } = props;

    const [state, setState] = useState(stringListStream.items);

    useEffect(() => {
        let callback = (items) => {
            setState(stringListStream.items);
        };
        stringListStream.on(callback);

        return () => {
            stringListStream.off(callback);
        };
    }, []);

    return useMemo(() => {
        //console.log("Displayiew");
        return (
            <div style={{fontSize: "12px"}}>
                {
                    state.map((item) => (
                        <div key={item.id}>{item.message}</div>
                    ))
                }
            </div>
        );
    }, [state]);
}

/*
export function MessageSampleView(props) {
    const textAreaEl = useRef();

    useEffect(() => {
        textAreaEl.current.appendChild(props.controller.textarea);
    }, [props.controller]);

    return useMemo(() => {
        console.log("MessageSampleView");
        return (
            <div ref={textAreaEl} style={{fontSize: "12px"}}/>
        );
    }, [props.controller]);
}
*/

/*
export function MessageSampleControllerView(props) {
    const {
        timestamp,
        dataProvider
    } = props;

    return useMemo(() => {
        console.log("MessageSampleControllerView");
        return (
            <div>
            <button onClick={() => dataProvider.sendData('Status/type1', {start_time: timestamp, end_time: timestamp})}>Type1: Tx:JSON, Rx:JSON</button>
            <button onClick={() => dataProvider.sendData('Status/Debug', {start_time: timestamp, end_time: timestamp})}>Type3: status Tx:JSON, Rx:Proto</button>
            </div>
        );
    }, [dataProvider, timestamp]);
}
*/