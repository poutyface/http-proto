export class Playback {
    constructor() {
        this.timestamp = 0;
        this.reset();
    }

    seek(timestamp){
        this.timestamp = timestamp - 1;
        if(this.timestamp < 0){
            this.timestamp = 0;
        }
    }

    next(){
        this.timestamp += 1;
        return this.timestamp;
    }

    back(){
        this.seek(this.timestamp - 1);
        return this.timestamp;
    }

    reset(){
        this.timestamp = 0;
    }
}


export class PlaybackController {
    constructor(){
        this.playback = new Playback();
        this.handler = null;
        this.isPlaying = false;
        this.startTime = null;
        this._animateHandle = null;
    }

    on(handler) {
        this.handler = handler;
    }

    seek(timestamp){
        this.playback.seek(timestamp);
    }

    _emit(timestamp) {
        if(this.handler){
            this.handler(timestamp);
        }        
    }

    next(){
        this._emit(this.playback.next());
    }

    back(){
        this._emit(this.playback.back());
    }

    _animate(){
        this._resetAnimate();

        this._animateHandle = requestAnimationFrame(() => {
            this._animate();
        });
        
        const lastTime = performance.now();
        const duration = lastTime - this.startTime;
        if(duration > 33){
            this.next();
            this.startTime = performance.now();
        }
    }
    
    _resetAnimate(){
        if(this._animateHandle){
            cancelAnimationFrame(this._animateHandle);
            this._animateHandle = null;
        }        
    }

    start(){
        this.stop();

        this.isPlaying = true;
        this.startTime = performance.now();
        this._animate();
    }

    stop(){
        this.isPlaying = false;
        this._resetAnimate();
    }

    reset(){
        this.stop();
        this.playback.reset();
    }
}
