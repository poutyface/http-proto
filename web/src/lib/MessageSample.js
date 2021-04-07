const { v4: uuidv4 } = require('uuid');
import { createRequest, getRequestPath, delay } from 'lib/utils.js';
import { WebsocketEndpoint } from 'lib/websocket_endpoint.js';

export class MessageStreamBuffer {
    constructor() {
        /*
            data = { timestamp : {
                streams: {
                    "foo": (value | null),
                    "bar": (value | null),
                }
            }}
        */
        this.data = {};
        this.startTime = 0;
        this.endTime = 0;
        this.clear();
    }

    clear() {
        this.data = {};
        this.startTime = 0;
        this.endTime = 0;
    }

    getStartTime() {
        return this.startTime;
    }

    getEndTime() {
        return this.endTime;
    }

    insert(key, message) {
        let timestamp = message.timestamp;

        if (!this.data[timestamp]) {
            if (this.startTime > timestamp) {
                this.startTime = timestamp;
            }
            if (this.endTime < timestamp) {
                this.endTime = timestamp;
            }
            if (this.startTime > this.endTime) {
                this.endTime = this.startTime;
            }
        }

        this.data[timestamp] = this.data[timestamp] || {};
        this.data[timestamp].streams = this.data[timestamp].streams || {};
        this.data[timestamp].streams[key] = message;
    }

    getMessagePoint(key, timestamp) {
        if (this.data[timestamp]) {
            if (this.data[timestamp].streams[key]) {
                return this.data[timestamp].streams[key];
            }
            else {
                return null;
            }
        } else {
            return null;
        }
    }

    get(startTime, endTime) {

        let messages = [];
        for (let i = startTime; i <= endTime; i++) {
            if (this.data[i]) {
                messages.push(this.data[i]);
            }
        }

        return messages.reverse();
    }

    getMessage(key, startTime, endTime) {
        let messages = [];
        let datum = this.get(startTime, endTime);
        for (let i = 0; i < datum.length; i++) {
            if (datum[i].streams[key]) {
                messages.push(datum[i].streams[key]);
            }
        }
        return messages;
    }

    static filter(key, datum = []) {
        let messages = [];
        for (let i = 0; i < datum.length; i++) {
            if (datum[i].streams[key]) {
                messages.push(datum[i].streams[key]);
            }
        }
        return messages;
    }
}


export class TimeSeriesDataProvider {
    getStartTime() {
        throw new Error("not impl");
    }

    getEndTime() {
        throw new Error("not impl");
    }

    async getMessage(requestCreator, startTime, endTime) {
        throw new Error("not imple");
    }

    clear() {
        throw new Error("not imple");
    }
}


export class BlockCacheDataProvider extends TimeSeriesDataProvider {
    constructor(ws) {
        super();

        this.ws = ws;
        this.eventNames = new Set();
        this.streamBuffer = new MessageStreamBuffer();
        this.handlers = [];

        this.requestBlocks = {};
        this.loadedBlocks = {};
        this.request = [];
        this.blockMs = 100;
    }

    getStartTime() {
        return this.streamBuffer.getStartTime();
    }

    getEndTime() {
        return this.streamBuffer.getEndTime();
    }

    async getMessage(requestCreator, startTime, endTime) {
        return await this.get(requestCreator, {startTime: startTime, endTime: endTime});
    }

    clear(){
        this.streamBuffer.clear();
    }


    _listen(eventName) {
        if (!this.eventNames.has(eventName)) {
            this.eventNames.add(eventName);
            this.ws.on(eventName, (vizdata) => { this._callback(vizdata) });
        }
    }

    _callback(vizdata) {
        if (vizdata.schema !== "Stream") {
            throw new Error("BlockChacheDataProvider: not Stream");
        }

        vizdata.data.items.forEach(item => {
            //console.log(vizdata.data.subject + "; receive: " + item.timestamp);
            this.streamBuffer.insert(vizdata.data.subject, item);
            this.handlers.map((hdr) => {
                hdr(vizdata.data.subject, item);
            });
        });

        // mark loaded if time range is block boundary
        const startTime = vizdata.data.startTime;
        const endTime = vizdata.data.endTime;
        if (startTime % this.blockMs === 0 && (endTime + 1) % this.blockMs === 0) {
            const startBlock = this._toBlockIndex(startTime);
            const endBlock = this._toBlockIndex(endTime);
            const subject = vizdata.data.subject;
            this.loadedBlocks[subject] = this.loadedBlocks[subject] || {};
            for (var i = startBlock; i <= endBlock; i++) {
                this.loadedBlocks[subject][i] = true;
            }
        }

        // notify
        let newRequest = [];
        this.request.forEach(waitBlock => {
            if (this.loadedBlocks[waitBlock.subject]) {
                let noloaded = [];
                waitBlock.blocks.forEach(idx => {
                    if (!this.loadedBlocks[waitBlock.subject][idx]) {
                        noloaded.push(idx);
                    }
                });
                if (noloaded.length > 0) {
                    newRequest.push(waitBlock);
                } else {
                    // notify
                    waitBlock.resolve();
                }
            } else {
                newRequest.push(waitBlock);
            }

        });

        this.request = newRequest;
    }

    getStreamBuffer() {
        return this.streamBuffer;
    }

    on(handler) {
        this.handlers.push(handler);
    }

    off(handler) {
        this.handlers = this.handlers.filter(hdr => hdr !== handler);
    }

    _toBlockIndex(timestamp) {
        return Math.floor(timestamp / this.blockMs);
    }

    _toBlockStartTime(block) {
        return block * this.blockMs;
    }

    _toBlockEndTime(block) {
        return block * this.blockMs + (this.blockMs - 1);
    }

    _fetch(requestCreator, startTime, endTime) {
        let subject = requestCreator.getSubject();

        if (startTime < 0) {
            startTime = 0;
        }

        // to block
        let startBlock = this._toBlockIndex(startTime);
        let endBlock = this._toBlockIndex(endTime);

        this.requestBlocks[subject] = this.requestBlocks[subject] || {};

        let requestBlocks = [];
        let remainBlocks = [];
        for (var i = startBlock; i <= endBlock; i++) {
            requestBlocks.push(i);

            if (this.requestBlocks[subject][i]) {
                continue;
            }
            this.requestBlocks[subject][i] = true;
            remainBlocks.push(i);
        }

        if (remainBlocks.length === 0) {
            return requestBlocks;
        }

        // listen
        let _req = requestCreator.createRequest(0, 0);
        this._listen(_req.header.path);

        remainBlocks.forEach(idx => {
            // request per block
            let startBlockTime = this._toBlockStartTime(idx);
            let endBlockTime = this._toBlockEndTime(idx);
            let message = requestCreator.createRequest(startBlockTime, endBlockTime);
            this.ws.sendMessage(message);
            //console.log("query:" + startBlockTime + ":" + endBlockTime);
        });

        return requestBlocks;
    }

    async _fetchSync(requestCreator, startTime, endTime) {
        let waitBlocks = this._fetch(requestCreator, startTime, endTime);

        const promise = new Promise(resolve => {
            this.request.push(
                {
                    subject: requestCreator.getSubject(),
                    blocks: waitBlocks,
                    resolve: resolve,
                }
            );
        });
        await promise;
    }

    async get(requestCreator, timestamp) {
        const { startTime, endTime } = timestamp;
        let subject = requestCreator.getSubject();

        let cacheData = this.streamBuffer.getMessage(subject, startTime, endTime);

        if (cacheData.length > 0) {
            console.log("cache " + endTime);

            // prefetch
            //console.log("prefetch");
            this._fetch(requestCreator, endTime + 1, endTime + this.blockMs * 2);

            return cacheData;
        } else {
            // check if the block is loaded
            let startBlock = this._toBlockIndex(startTime);
            let endBlock = this._toBlockIndex(endTime);
            let loaded = true;
            this.loadedBlocks[subject] = this.loadedBlocks[subject] || {};
            for (var i = startBlock; i <= endBlock; i++) {
                if (!this.loadedBlocks[subject][i]) {
                    loaded = false;
                }
            }
            if (loaded) {
                // no data
                return [];
            }

            // fetch
            await this._fetchSync(requestCreator, startTime, endTime);

            // prefetch
            //console.log("prefetch");
            this._fetch(requestCreator, endTime + 1, endTime + this.blockMs * 2);

            //console.log("after fetch: " + subject + ":" + startTime + ":" + endTime);
            cacheData = this.streamBuffer.getMessage(subject, startTime, endTime);
            return cacheData;
        }

    }
}


export class LiveDataProvider extends TimeSeriesDataProvider {
    constructor(ws) {
        super();

        this.ws = ws;
        this.eventNames = new Set();
        this.request = [];
    }

    _listen(eventName) {
        if (!this.eventNames.has(eventName)) {
            this.eventNames.add(eventName);
            this.ws.on(eventName, (vizdata) => { this._callback(vizdata) });
        }
    }

    _callback(vizdata) {
        if (vizdata.schema !== "Stream") {
            throw new Error("LiveDataProvider: not Stream");
        }

        let newRequest = [];
        //console.log(vizdata.data.subject + "; receive: " + vizdata.data.startTime + ":" + vizdata.data.endTime);
        this.request.forEach(req => {
            if(req.subject === vizdata.data.subject){
                req.resolve(vizdata.data.items);
            } else {
                newRequest.push(req);
            }
        });

        this.request = newRequest;
    }

    async _fetch(requestCreator) {
        // listen
        let req = requestCreator.createRequest(0, 0);
        this._listen(req.header.path);
        this.ws.sendMessage(req);
        //console.log("live query");

        const promise = new Promise(resolve => {
            this.request.push(
                {
                    subject: requestCreator.getSubject(),
                    resolve: resolve,
                }
            );
        });
        return await promise;
    }

    getStartTime() {
        return 0;
    }

    getEndTime() {
        return 0;
    }

    async getMessage(requestCreator, startTime, endTime) {
        return await this._fetch(requestCreator);
    }

    clear() {
    }

}


export class PlaybackDataLoader {
    // provider : TimeSeriesDataProvider
    constructor(provider) {
        this.provider = provider;
        this.startTime = -1;
        this.timestamp = this.getStartTime();
    }

    seek(timestamp) {
        this.timestamp = timestamp;
    }

    getCurrentTime() {
        return this.timestamp;
    }

    setStartTime(timestamp) {
        this.startTime = timestamp;
        this.timestamp = this.getStartTime();
    }

    getStartTime() {
        if (this.startTime === -1) {
            return this.provider.getStartTime();
        } else {
            return this.startTime;
        }
    }

    getEndTime() {
        return this.provider.getEndTime();
    }


    async getMessage(requestCreator, startTime, endTime) {
        return await this.provider.getMessage(requestCreator, startTime, endTime);
    }

    reset() {
        this.provider.clear();
        this.timestamp = this.getStartTime();
    }
}


export class StringListStream {
    constructor() {
        this.items = [];
        this.handlers = [];
    }

    on(handler) {
        this.handlers.push(handler);
    }

    off(handler) {
        this.handlers = this.handlers.filter(hdr => hdr !== handler);
    }

    push(message) {
        let newItem = [{ id: uuidv4(), message: message }];
        this.items = newItem.concat(this.items).slice(0, 50);

        for (const handler of this.handlers) {
            handler(this.items);
        }
    }
}


export class MessageBroker {
    constructor() {
        this.handlers = [];
    }

    on(handler) {
        this.handlers.push(handler);
    }

    off(handler) {
        this.handlers = this.handlers.filter(hdr => hdr !== handler);
    }

    push(message) {
        for (const handler of this.handlers) {
            handler(message);
        }
    }
}



/*
export class MessageSampleController {
    constructor(dataProvider) {
        console.log("messagesample: constructor");
        this.dataProvider = dataProvider;
        this.handlers = [];
        this.timestamp = 0;

        this.data = {
            message: {},
            text: '',
        };

        this.textarea = document.createElement('textarea');
        this.textarea.cols = 80;
        this.textarea.rows = 5;

        this.dataProvider.on('Status/type1', (data) => {
            this.data.message = data;
            this.update(data);
        });
        this.dataProvider.on('Status/Position', (data) => {
            this.data.message = data;
            this.update(data);
        });
        this.dataProvider.on('Status/Debug', (data) => {
            this.data.message = data;
            this.update(data);
        });
    }

    addText(data) {
        this.data.text += JSON.stringify(data) + '\n';
        const textLength = this.data.text.length;
        if (textLength > 100) {
            this.data.text = this.data.text.substring(textLength - 1000);
        }
    }

    update(data) {
        this.addText(data);
        this.textarea.value = this.data.text;
        this.textarea.scrollTop = this.textarea.scrollHeight;
        for (const handler of this.handlers) {
            handler(this.data);
        }
    }

    on(handler) {
        this.handlers.push(handler);
    }

    setTimestamp(timestamp) {
        this.timestamp = timestamp;
    }

    getMessage(type = '') {
        if (type === '') {
            this.dataProvider.sendData('Status/type1', { start_time: this.timestamp, end_time: this.timestamp });
            this.dataProvider.sendData('Status/Position', { start_time: this.timestamp, end_time: this.timestamp });
            this.dataProvider.sendData('Status/Debug', { start_time: this.timestamp, end_time: this.timestamp });
        } else {
            this.dataProvider.sendData(type, { start_time: this.timestamp, end_time: this.timestamp });
        }
        this.timestamp += 1;
    }
}
*/
