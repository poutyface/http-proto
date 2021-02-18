const protobuf = require('protobufjs/light');
const protoBundle = require("proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);
const Inbox = protoRoot.lookupType("Inbox");


export class WebsocketEndpoint {
    constructor(serverAddress) {
        this.serverAddress = serverAddress;
        this.websocket = null;
        this.handlers = {};
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
        }

        this.websocket.onerror = (event) => {
            console.log("Websocket error `${error.message}`");
        }

        this.websocket.onmessage = (event) => {
            if (event && event.data){
                if (typeof event.data === 'string'){
                    const data = JSON.parse(event.data);
                    const messageType = data['type'];
                    if(this.handlers[messageType]){
                        for(const handler of this.handlers[messageType]){
                            handler(data);
                        }
                    }
                } else {
                    const message = Inbox.decode(new Uint8Array(event.data));
                    // To Object, Becase protobuf v3 don't sent a 0 value(default value).
                    const inbox = Inbox.toObject(message, {
                        defaults: true,
                        enums: String,
                    });
                    const messageType = inbox.type;
                    if(this.handlers[messageType]){
                        for(const handler of this.handlers[messageType]){
                            handler(inbox);
                        }
                    }
                    
                }
            }
        };
    }

    on(eventName, handler) {
        if(!this.handlers[eventName]){
            this.handlers[eventName] = [];
        }
        this.handlers[eventName].push(handler);
    }

    // send json message 
    sendData(eventName, data) {
        let message = {
            type: eventName,
            fields: data,
        };
        this.websocket.send(JSON.stringify(message));
    }

}
