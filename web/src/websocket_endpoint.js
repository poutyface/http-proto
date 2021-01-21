const protobuf = require('protobufjs/light');
const protoBundle = require("./proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);
const Inbox = protoRoot.lookupType("Inbox");


export class WebsocketEndpoint {
    constructor(serverAddress) {
        this.serverAddress = serverAddress;
        this.websocket = null;
        this.handlers = {};
        this.init();
    }
    
    init(){
        try {
            this.websocket = new WebSocket(this.serverAddress);
            this.websocket.binaryType = 'arraybuffer';
        } catch (error) {
            console.error(`Failed to establish: ${error}`);
            return;
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
                    const inbox = Inbox.decode(new Uint8Array(event.data));
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
            data: data,
        };
        this.websocket.send(JSON.stringify(message));
    }

}
