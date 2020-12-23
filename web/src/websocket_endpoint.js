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
                    let data = JSON.parse(event.data);
                    let messageType = data['type'];
                    if(this.eventHandlers[messageType]){
                        this.eventHandlers[messageType](data);
                    }
                } else {
                    if(this.eventHanderOnBinary){
                        this.eventHanderOnBinary(event.data);
                    }
                }
            }
        };
    }

    on(eventName, fn) {
        this.eventHandlers[eventName] = fn;
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
