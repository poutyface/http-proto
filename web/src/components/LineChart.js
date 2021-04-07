import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { LineChartController }  from 'lib/LineChart.js';


export function LineChartView(props) {
    const {
        title,
        axisX,
        axisY,
        value
    } = props;

    const chart = useMemo(() => new LineChartController(title, axisX, axisY), []);
    const canvasEl = useRef();

    useEffect(() => {
        canvasEl.current.appendChild(chart.canvas);

        return (() => {
            chart.drop();
        });
    }, []);

    useEffect(() => {
        if(value){
            chart.update(value);
        }
    }, [value]);

    return useMemo(() => {
        console.log("LineChartView");
        return (
            <div ref={canvasEl} style={{ display: "flex", width: "100%"}} />
        );
    }, []);
}

/*
// [deprecated]
export function LineChartControllerView(props) {
    const {
        playback
    } = props;

    return useMemo(() => {
        console.log("LineChartControllView");
        return (
            <button onClick={() => playback.next() }>Get</button>
        );
    }, []);
}
*/
