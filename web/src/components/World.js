import React, { useState, useMemo, useEffect, useRef, useCallback, useReducer, createContext, useContext } from 'react';

export function WorldView(props) {
    const canvasEl = useRef();

    
    useEffect(() => {
        canvasEl.current.appendChild(props.controller.renderer.canvas);
    }, [props.controller]);
    
    return useMemo(() => {
        console.log("WorldView");
        return (
            <div ref={canvasEl} />
        );
    }, [props.controller]);
}
