import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext } from 'react';

export function WorldView(props) {
    const canvasEl = useRef();

    console.log("WorldView");

    useEffect(() => {
        canvasEl.current.appendChild(props.controller.renderer.canvas);
    }, [props.controller]);

    return (
        <div ref={canvasEl} />
    );
}
