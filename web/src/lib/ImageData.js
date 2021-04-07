import { Playback } from 'lib/Player.js';
import { BlockCacheDataProvider } from 'lib/MessageSample.js';
import Worker from 'lib/image_canvas.worker.js';
import { createRequest, protobufRoot, delay } from 'lib/utils.js';
const { v4: uuidv4 } = require('uuid');

const RequestImage = protobufRoot.lookupType("RequestImage");
const RequestStreamImage = protobufRoot.lookupType("RequestStreamImage");
const RequestStopStreamImage = protobufRoot.lookupType("RequestStopStreamImage");


export class RemoteImageDataProvider extends BlockCacheDataProvider {
    // ws: image data service [WebSocketEndpoint]
    constructor(imageService){
        super(imageService);
    }

    startStream(client_id, subject, scale = 1.0, timestamp = 1) {
        let message = createRequest(RequestStreamImage, {
            client_id: client_id,
            resource: subject,
            start_time: timestamp,
            scale_x: scale,
            scale_y: scale
        });

        this._listen(message.header.path);

        this.ws.sendMessage(message);
    }

    stopStream(client_id) {
        let message = createRequest(RequestStopStreamImage, { client_id: client_id });
        this.ws.sendMessage(message);
    }
}


class TimeSerieseRequestCreator {
    getSubject(){
        throw new Error("not impl");
    }

    createRequest(startTime, endTime){
        throw new Error("not impl");
    }
}

class RequestImageDataCreator extends TimeSerieseRequestCreator {
    constructor(subject, scale) {
        super();

        this.subject = subject;
        this.scale = scale;
    }

    // must
    getSubject() {
        return this.subject;
    }

    // must
    createRequest(startTime, endTime) {
        let message = createRequest(RequestImage, {
            start_time: startTime,
            end_time: endTime,
            resource: this.subject,
            scale_x: this.scale,
            scale_y: this.scale
        });

        return message;
    }
}


export class ImageDataController {
    /*
    call drop() before instance is dorpped

    subject: image data resource name
    imageDataProvider: RemoteImageDataProvider
    */
    constructor(subject, imageDataProvider) {
        this.subject = subject;
        this.dataProvider = imageDataProvider;
        this.requestCreator = new RequestImageDataCreator(this.subject, 1.0);
        this.worker = new Worker();
        this.canvas = document.createElement("canvas");
        const offscreen = this.canvas.transferControlToOffscreen();
        this.worker.postMessage({ type: "initialize", canvas: offscreen }, [offscreen]);
    }

    setScale(scale) {
        this.requestCreator = new RequestImageDataCreator(this.subject, scale);
    }

    getDataProvider() {
        return this.dataProvider;
    }

    getStreamBuffer() {
        return this.dataProvider.getStreamBuffer();
    }

    drop() {
        this.worker.postMessage({ type: "drop" });
        this.worker.terminate();
    }

    async get(timestamp = { startTime: 0, endTime: 0 }) {
        let images = await this.dataProvider.get(this.requestCreator, timestamp);
        return images;
    }

    async _render(data) {
        this.worker.postMessage({ type: "render", inbox: data });
    }

    render(data) {
        this._render(data);
    }
}


export class ImageDataStreamController {
    /*
    call drop() when instance is dorpped

    subject: image data resource name
    imageDataProvider: RemoteImageDataProvider
    */
    constructor(subject, imageDataProvider) {
        this.subject = subject;
        this.client_id = uuidv4();
        this.dataProvider = imageDataProvider;
        this.playback = new Playback();
        this.isStreaming = false;
        this.scale = 1.0;

        this.worker = new Worker();
        this.worker.addEventListener('message', (event) => {
            this.playback.seek(event.data.timestamp);
        });

        this.canvas = document.createElement("canvas");
        const offscreen = this.canvas.transferControlToOffscreen();
        this.worker.postMessage({ type: "initialize", canvas: offscreen }, [offscreen]);

        this.callback = (subject, item) => {
            //console.log("stream recieve:", item.timestamp);
            if (subject === this.subject) {
                this._render(item);
            } else {
                this.playback.seek(item.timestamp);
            }
        };
        this.dataProvider.on(this.callback);
    }

    setScale(scale) {
        this.scale = scale;
    }

    async _render(item) {
        this.worker.postMessage({ type: "render", inbox: item });
    }

    drop() {
        if (this.isStreaming) {
            this.stopStream();
        }
        this.dataProvider.off(this.callback);
        this.worker.postMessage({ type: "drop" });
        this.worker.terminate();
    }

    reset() {
        this.playback.reset();
        this.isStreaming = false;
    }

    seek(timestamp) {
        this.playback.seek(timestamp);
    }

    startStream() {
        this.isStreaming = true;
        this.dataProvider.startStream(this.client_id, this.subject, this.scale, this.playback.getCurrentTime());
        return this.isStreaming;
    }

    stopStream() {
        this.isStreaming = false;
        this.dataProvider.stopStream(this.client_id);
        return this.isStreaming;
    }
}

