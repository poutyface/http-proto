
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
        if(textLength > 100){
            this.data.text = this.data.text.substring(textLength-1000);
        }
    }

    update(data){
        this.addText(data);
        this.textarea.value = this.data.text;
        this.textarea.scrollTop = this.textarea.scrollHeight;
        for(const handler of this.handlers){
            handler(this.data);
        }
    }

    on(handler) {
        this.handlers.push(handler);
    }

    setTimestamp(timestamp) {
        this.timestamp = timestamp;
    }

    getMessage(type='') {
        if(type === ''){
            this.dataProvider.sendData('Status/type1', {timestamp: this.timestamp});
            this.dataProvider.sendData('Status/Position', {timestamp: this.timestamp});
            this.dataProvider.sendData('Status/Debug', {timestamp: this.timestamp});
        } else {
            this.dataProvider.sendData(type, {timestamp:this.timestamp});
        }
        this.timestamp += 1;
    }

}

export class MessageController {
    constructor(messageType, dataProvider) {
        console.log("MessageControl: constructor");
        this.dataProvider = dataProvider;
        this.messageType = messageType;
        this.handler = null;
        this.timestamp = 0;

        this.dataProvider.on(this.messageType, (inbox) => {
            if(this.handler){
                this.handler(inbox);
            } 
        });
    }

    on(handler) {
        this.handler = handler;
    }

    off(){
        this.handler = null;
    }

    setTimestamp(timestamp) {
        this.timestamp = timestamp;
    }

    getMessage() {
        this.dataProvider.sendData(this.messageType, {timestamp:this.timestamp});
    }
}

