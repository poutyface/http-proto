import { protobufRoot } from 'lib/utils.js';

const WSResponse = protobufRoot.lookupType("WSResponse");

export class WebsocketEndpoint {
    constructor(serverAddress) {
        this.serverAddress = serverAddress;
        this.websocket = null;
        this.handlers = {};
        this.receiver = null;
    }
    
    close(){
        this.websocket.close();
    }

    connect(){
        try {
            this.websocket = new WebSocket(this.serverAddress);
            this.websocket.binaryType = 'arraybuffer';
        } catch (error) {
            console.error(`WebSocket: Failed to establish: ${error.message}`);
            throw error;
        }

        this.websocket.onclose = (event) => {
            console.log("Websocket close");
            console.log("Try reconnect");
            setTimeout(() => {
                this.connect();
            }, 1000);
        }

        this.websocket.onerror = (event) => {
            console.log("Websocket error `${error.message}`");
        }

        this.websocket.onmessage = (event) => {
            if (event && event.data){
                if (typeof event.data === 'string'){
                    const data = JSON.parse(event.data);
                    const messageType = data['path'];
                    if(this.handlers[messageType]){
                        for(const handler of this.handlers[messageType]){
                            handler(data);
                        }
                    }
                    if(this.receiver){
                        this.receiver(data);
                    }
                } else {
                    const response = WSResponse.decode(new Uint8Array(event.data));                    
                    // decode proto Any 
                    // type_url: type.goolgeapis.com/(MessageType)
                    const schema = response.data.type_url.split("/")[1];
                    const anyType = protobufRoot.lookupType(schema);
                    const messageObj = anyType.decode(response.data.value);
                    // To Object, Becase protobuf v3 don't sent a 0 value(default value).
                    const messageData = anyType.toObject(messageObj, {
                        defaults: true,
                        enums: String,
                    });
                    const vizdata = {
                        path: response.path,
                        schema: schema,
                        data: messageData,
                    };

                    if(this.handlers[vizdata.path]){
                        for(const handler of this.handlers[vizdata.path]){
                            handler(vizdata);
                        }
                    }
                    if(this.receiver){
                        this.receiver(vizdata);
                    }
                }
            }
        };
    }

    on(eventName, handler) {
        if(eventName === '*'){
            this.receiver = handler;
            return;
        }

        if(!this.handlers[eventName]){
            this.handlers[eventName] = [];
        }
        this.handlers[eventName].push(handler);
    }

    off(eventName, handler) {
        if(this.handlers[eventName]){
            let newHandlers = this.handlers[eventName].filter(hdr =>  hdr !== handler);
            this.handlers[eventName] = newHandlers;
        }
    }


    // send json message 
    sendData(path, data) {
        let message = {
            header :{ 
                path: path,
            },
            ...data,
        };
        this.websocket.send(JSON.stringify(message));
    }

    // send proto message
    sendMessage(message){
        this.websocket.send(JSON.stringify(message));
    }

}
