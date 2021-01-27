
export class MessageSampleControl {
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

        this.dataProvider.on('type1', (data) => {
            this.data.message = data;
            this.update(data);
        });
        this.dataProvider.on('Position', (data) => {
            this.data.message = data;
            this.update(data);
        });
        this.dataProvider.on('Status', (data) => {
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
            this.dataProvider.sendData('type1', {timestamp: this.timestamp});
            this.dataProvider.sendData('Position', {timestamp: this.timestamp});
            this.dataProvider.sendData('Status', {timestamp: this.timestamp});
        } else {
            this.dataProvider.sendData(type, {timestamp:this.timestamp});
        }
        this.timestamp += 1;
    }

}

export class StateControl {
    constructor(dataProvider) {
        console.log("StateControl: constructor");
        this.dataProvider = dataProvider;
        this.handler = null;
        this.timestamp = 0;

        this.dataProvider.on('State', (data) => {
            if(this.handler){
                this.handler(data);
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
        this.dataProvider.sendData('State', {timestamp:this.timestamp});
    }
}

