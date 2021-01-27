import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext } from 'react';

export function WorldView(props) {
    const canvasEl = useRef();

    console.log("WorldView");

    useEffect(() => {
        canvasEl.current.appendChild(props.ctrl.renderer.canvas);
    }, []);

    return (
        <div ref={canvasEl} />
    );
}
