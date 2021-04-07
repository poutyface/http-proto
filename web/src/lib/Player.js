// timestamp: milliseconds
export class Playback {
    // step: milliseconds
    constructor(interval=33) {
        this.timestamp = 0;
        this.interval = interval;
        this.reset();
    }

    getCurrentTime(){
        return this.timestamp;
    }

    seek(timestamp){
        this.timestamp = timestamp;
        if(this.timestamp < 0){
            this.timestamp = 0;
        }
        return this.timestamp;
    }

    next(){
        this.timestamp += this.interval;
        return this.timestamp;
    }

    back(){
        this.seek(this.timestamp - this.interval);
        return this.timestamp;
    }

    reset(){
        this.timestamp = 0;
    }
}




export class Player {
    constructor(loader, config={}){
        this.config = {
            interval: 33,
            onPlay: async (player, timestamp) => {},
            onPause: async (player, timestamp) => {},
            onSeek: async (player, timestamp) => { return true; },
        };

        this.config = Object.assign(this.config, config);
        this.frameCount = 0;
        this.isPlaying = false;
        this._lastAnimateTime = 0;
        this._animateHandle = null;
        this.loader = loader;
        this.stateId = -1;
    }

    setLoader(loader) {
        this.stop();
        this.loader = loader;
    }

    getCurrentTime(){
        return this.loader.getCurrentTime();
    }

    getInterval(){
        return this.config.interval;
    }

    getNewStateId(){
        this.stateId = this.stateId + 1;
        return this.stateId;
    }
    
    async next(){
        let newTimestamp = this.getCurrentTime() + this.getInterval(); 
        await this._tick(newTimestamp);
    }

    async back(){
        let newTimestamp = this.getCurrentTime() - this.getInterval();
        await this._tick(newTimestamp);
    }

    async _tick(timestamp){
        if(this.isPlaying){
            return;
        }

        this.getNewStateId();
        await this._onPause(this.getCurrentTime());
        this.loader.seek(timestamp);
        await this._onSeek(timestamp);
    }

    async _animate(){
        this._resetAnimate();

        let stateId = this.getNewStateId();
        this.stateId = stateId;
        
        const now = performance.now();
        const duration = now - this._lastAnimateTime;
        let timestamp = this.getCurrentTime();
        if(duration > this.getInterval()){
            let newTimestamp = this.getCurrentTime() + (this.frameCount === 0 ? 0 : this.getInterval());
            let update = await this._onSeek(newTimestamp);
            //console.log(timestamp + "->" + newTimestamp);
            if(update){
                this._lastAnimateTime = performance.now();
            }
        }
        
        if(this.isPlaying && this.stateId === stateId){
            this._animateHandle = requestAnimationFrame(() => {
                this._animate();
            });
        }
    }
    
    _resetAnimate(){
        if(this._animateHandle){
            cancelAnimationFrame(this._animateHandle);
            this._animateHandle = null;
        }        
    }

    async play(){
        await this._onPlay(this.getCurrentTime());
        return this.isPlaying;
    }
    
    async _onPlay(timestamp) {
        this.pause();
    
        this.frameCount = 0;
        this.isPlaying = true;

        await this.config.onPlay(this, timestamp);

        this._lastAnimateTime = performance.now();
        this._animate();
    }


    async pause(){
        await this._onPause(this.getCurrentTime());
        return this.isPlaying;
    }

    async _onPause(timestamp){
        this.isPlaying = false;
        this.stateId = -1;
        this._resetAnimate();
        this.frameCount = 0;
        await this.config.onPause(this, timestamp);
    }

    async seek(timestamp) {
        await this._onPause(this.getCurrentTime());

        if(timestamp < 0){
            timestamp = 0;
        }

        this.loader.seek(timestamp);
        await this._onSeek(timestamp);
    }

    async _onSeek(timestamp) {
        if(timestamp < 0){
            timestamp = 0;
        }

        let stateId = this.stateId;
  
        if(await this.config.onSeek(this, timestamp)){
            if(stateId === this.stateId){
                this.loader.seek(timestamp);
                this.frameCount = this.frameCount + 1;
            }
            return true;
        }

        return false;
    }

    async stop(){
        await this.pause();
        this.loader.seek(this.loader.getStartTime());
        return this.isPlaying;
    }
}

