import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';

export function PlayerControlView(props) {
    const { 
        player,
    } = props;

    const [ playing, setPlaying ] = useState(player.isPlaying);
    const unmounted = useRef(false);

    useEffect(() => {
        return (()=> {
            unmounted.current = true;
        });
    }, []);

    const stop = useCallback(() => {
        player.stop().then(value => unmounted.current || setPlaying(value));
    }, [player, setPlaying, unmounted.current]);

    const play = useCallback(() => {
        player.play().then(value => unmounted.current || setPlaying(value));
    }, [player, setPlaying, unmounted.current]);

    const pause = useCallback(() => {
        player.pause().then(value => unmounted.current || setPlaying(value));
    }, [player, setPlaying, unmounted.current]);

    const step = useCallback(() => { 
        player.next();
    }, [player]);

    const back = useCallback(() => {
        player.back();
    }, [player]);


    return useMemo(() => {
        console.log("PlayerControl");

        return (
            <>
            <button onClick={() => stop()}>STOP</button>
            {playing 
            ? <button onClick={() => pause()}>PAUSE</button>
            : <button onClick={() => play()}>PLAY</button>
            }
            <button disabled={playing} onClick={() => back()}>BACK</button>
            <button disabled={playing} onClick={() => step()}>STEP</button>
            </>
        );
    }, [playing]);    
}
