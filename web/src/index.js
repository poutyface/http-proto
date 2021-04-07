import React, { useState, useEffect, useRef, useCallback, useReducer, createContext, useContext, useMemo } from 'react';
import ReactDOM from 'react-dom';

import {PlayerControlView} from 'components/Player.js';
import {RawMessageView} from 'components/RawMessage.js';
import {DisplayView} from 'components/MessageSample.js';
import {LineChartView}  from 'components/LineChart.js';
import {ImageDataView, StreamButton} from 'components/ImageData.js';
import {WorldView} from 'components/World.js';
import {AppContext, AppContextReducer, createAppContext} from 'AppContext.js';
import { createRequest, protobufRoot } from 'lib/utils.js';
import { ImageDataController, ImageDataStreamController } from 'lib/ImageData.js';
import { PlaybackDataLoader, LiveDataProvider, BlockCacheDataProvider} from 'lib/MessageSample.js';
import { Player } from './lib/Player.js';

const RequestStatus = protobufRoot.lookupType("RequestStatus");

const appContextValue = createAppContext();

function MainView(props) {
    const {
        player,
        status,
    } = props;

    const { app } = useContext(AppContext);

    let chartValue;
    if(status){
        chartValue = {
            x: status.point2d.x,
            y: status.point2d.y
        };
    }

    return (
        <div>
        <PlayerControlView player={player} />
        <div style={{display: 'flex', width: '100%'}}>
        <WorldView status={status} />
        <RawMessageView messageBroker={app.messageBrokers.any} />
        </div>
        <div style={{display: 'flex', width: '100%'}}>
        <LineChartView 
            title={"position"}
            axisX={"timestamp"}
            axisY={"pos"}
            value={chartValue} />
        <div>
            <button onClick={() => app.dataProvider.sendData('Status/type1', {start_time: player.getCurrentTime(), end_time: player.getCurrentTime()})}>Type1: Tx:JSON, Rx:JSON</button>
            <button onClick={() => app.dataProvider.sendData('Status/Debug', {start_time: player.getCurrentTime(), end_time: player.getCurrentTime()})}>Type3: status Tx:JSON, Rx:Proto</button>
        </div>
        </div>
        <div style={{height: "100px"}}>
        <DisplayView stringListStream={app.stringListStream["any"]} />
        </div>
        </div>
    );
}



function ControlView(props){
    const { app, dispatch } = useContext(AppContext);

    const imageDataController = useMemo(() => {
        const ctrl = new ImageDataController("/status/image", app.imageDataProvider);
        ctrl.setScale(0.5);
        return ctrl;        
    }, []);

    const imageDataStreamController = useMemo(() => {
        const ctrl = new ImageDataStreamController("/status/image", app.imageDataStreamProvider);
        ctrl.setScale(0.5);
        return ctrl;
    }, []);

    // TODO live
    /*
    const loader = useMemo(() => {
        const streamBuffer = imageDataController.getStreamBuffer();
        let loader = app.live ? new LiveLoader(streamBuffer) : new StreamLoader(streamBuffer);
        loader.setStartTime(33);
        return loader;
    }, [app.live]);
    */

    const loader = useMemo(() => {
        // blockcachedataprovider
        let loader = new PlaybackDataLoader(imageDataController.getDataProvider()); 
        loader.setStartTime(33);
        return loader;
    }, []);

    const player = useMemo(() => {
        const interval = 33;
        return new Player(loader, {
            interval: interval,
            onPlay: async (player, timestamp) => {
            },
            onSeek: async (player, timestamp) => {
                let images = await imageDataController.get({startTime: timestamp - 32, endTime: timestamp});
                if(images.length == 0){
                    console.log("no images");
                    return true;
                }

                imageDataController.render(images[0]);
                return true;
            }
        });
    }, []);

    useMemo(() => {
        (async () => {
            player.setLoader(loader);
            player.play();
        })();
    }, [loader]);

    useEffect(() => {
        return (() => {
            player.stop();
            imageDataController.drop();
            imageDataStreamController.drop();
        });
    }, []);

    const executeCommand = useCallback((command) => {
        app.commandExecuter.sendData(command, {});
    }, []);


    return useMemo(() => {
    return (
        <div>
            <button onClick={() => executeCommand("Command/Test")}>Command/Test</button>
            <ImageDataView controller={imageDataController} />
            <PlayerControlView player={player} />
            <StreamButton controller={imageDataStreamController} />
            <ImageDataView controller={imageDataStreamController} />
        </div>
    );
    }, [loader]);
}


function MainPanel(props) {
    return (
        <div>
        {props.children}
        </div>
    );
}


function App(props) {
    const [app, dispatch] = useReducer(AppContextReducer, appContextValue);
    const [status, setStatus] = useState(undefined);
    const liveDataProvider = useMemo(() => {
        return new LiveDataProvider(app.dataProvider);
    }, []);
    const streamDataProvider = useMemo(() => {
        return new BlockCacheDataProvider(app.dataProvider);
    }, []);
    const liveLoader = useMemo(() => {
        return new PlaybackDataLoader(liveDataProvider);
    }, []);
    const streamLoader = useMemo(() => {
        return new PlaybackDataLoader(streamDataProvider);
    }, []);

    const loader = useMemo(() => {
        return app.live ? liveLoader : streamLoader;
    }, [app.live]);

    const player = useMemo(() => {
        let interval = 33;
        return new Player(loader, {
            interval: interval,
            onPlay: async (player, timestamp) => {
            },
            onSeek: async (player, timestamp) => {
                let statusRequest = {
                    // must
                    getSubject: () => {
                        return "/status/status";
                    },
            
                    // must
                    createRequest: (startTime, endTime) => {
                        let message = createRequest(RequestStatus, {
                            start_time: startTime,
                            end_time: endTime,
                        });            
                        return message;
                    },
                };
            
                let datum = await player.loader.getMessage(statusRequest, timestamp - 32, timestamp);
                if(datum.length == 0){
                    console.log("no data");
                    return true;
                }

                app.messageBrokers.any.push(datum[0]);
                app.stringListStream.any.push(JSON.stringify(datum[0]));
                setStatus(datum[0].status);

                return true;    
            }
        });
    }, []);

    useMemo(() => {
        player.setLoader(loader);
    }, [loader]);

    //console.log("App");

    useEffect(() => {
        /*
        // all message
        app.dataProvider.on('*', (vizdata) => {
            // TODO ws response type
            if(vizdata.schema === 'Stream'){
                vizdata.data.items.forEach(item => {
                    app.streamBuffer.insert(item.subject, item);
                });
            }
        });
        */
        
        // Uncontrolled under playback timestamp
        // Demo only
        app.dataProvider.on("Status/type1", (data) => {
            app.messageBrokers.any.push(data);
        });

        // Demo only
        app.dataProvider.on("Status/Debug", (vizdata) => {
            app.messageBrokers.any.push(vizdata);
        });

    }, []);

    

    return (
        <AppContext.Provider value={{app, dispatch}}>
        <MainPanel key={app.appID} >
            { app.error && <div>app.error.message</div> }
            <button onClick={() => {
                app.streamBuffer.clear();
                player.stop();
                dispatch({type: 'RESET'});
            } }>RESET</button>
            {app.page === "Main" && <button onClick={() => dispatch({type:"PAGE", page:"Setting"})}>Control</button> }
            {app.page === "Setting" && <button onClick={() => dispatch({type:"PAGE", page:"Main"})}>Main</button> }
            <input type="checkbox" id="record" checked={app.record} onChange={() => dispatch({type: "RECORD", enable: !app.record})}></input>
            <label htmlFor="record">RECORD</label>
            <input type="checkbox" id="live" checked={app.live} onChange={() => dispatch({type: "LIVE", enable: !app.live})}></input>
            <label htmlFor="live">LIVE</label>
            {app.page === "Main" && <MainView player={player} status={status} />}
            {app.page === "Setting" && <ControlView player={player} />}
        </MainPanel>
        </AppContext.Provider>
    );
}


ReactDOM.render(
    <App />,
    document.getElementById("root")  
);
