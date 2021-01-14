const protobuf = require('protobufjs/light');
const protoBundle = require("./proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);
const Inbox = protoRoot.lookupType("Inbox");


export class WebsocketEndpoint {
    constructor(serverAddress) {
        this.serverAddress = serverAddress;
        this.websocket = null;
        this.eventHandlers = {};
        this.eventHandlerOnBinary = null;
    }
    
    init(){
        try {
            this.websocket = new WebSocket(this.serverAddress);
            this.websocket.binaryType = 'arraybuffer';
        } catch (error) {
            console.error(`Failed to establish: ${error}`);
            return;
        }
        
        this.websocket.onopen = () => {
            
        };
        
        this.websocket.onerror = (error) => {
            
        };

        this.websocket.onmessage = (event) => {
            if (event && event.data){
                if (typeof event.data === 'string'){
                    const data = JSON.parse(event.data);
                    const messageType = data['type'];
                    if(this.eventHandlers[messageType]){
                        this.eventHandlers[messageType](data);
                    }
                } else {
                    const inbox = Inbox.decode(new Uint8Array(event.data));
                    const messageType = inbox.type;
                    if(this.eventHandlers[messageType]){
                        this.eventHandlers[messageType](inbox);
                    }
                    
                }
            }
        };
    }

    on(eventName, callback) {
        this.eventHandlers[eventName] = callback;
    }

    onBinary(fn){
        this.eventHanderOnBinary = fn;
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
