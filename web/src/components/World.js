import React, { useState, useMemo, useEffect, useRef, useCallback, useReducer, useContext } from 'react';
import { WorldController } from 'lib/World.js';

export function WorldView(props) {
    const {
        status,
    } = props;

    const world = useMemo(() => new WorldController(), []);
    const canvasEl = useRef();

    useEffect(() => {
        canvasEl.current.appendChild(world.renderer.canvas);

        return (() => {
            world.drop();
        });
    }, []);

    useEffect(() => {
        if(status){
            world.update(status);
        }      
    }, [status]);
    
    return useMemo(() => {
        console.log("WroldView");
        return (
            <div ref={canvasEl} />
        );
    }, []);
}
