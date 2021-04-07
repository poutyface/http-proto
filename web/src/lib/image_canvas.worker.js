self.offscreen = null;
self.ctx = null;

self.addEventListener('message', (event) => {
    if (event.data.type == 'initialize'){
        self.offscreen = event.data.canvas;
        self.ctx = self.offscreen.getContext("2d");
        return;
    } 
    if (event.data.type == 'drop'){
        self.offscreen = null;
        self.ctx = null;
        return;
    }
    if(self.ctx === null){
        return;
    }

    const image = event.data.inbox.image;
    // encode base64, and set image src
    //let image = `data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null,obj.image))}`;
    //let obj = imageUpdate.toObject(message, {enums: String, bytes: String});
    //self.postMessage(obj);
    //console.log(event.data.inbox.timestamp);

    var blob = new Blob([image.data], { type: image.mime_type });

    var bitmap = self.createImageBitmap(blob);
    bitmap.then(bitmap => {
        self.offscreen.width = bitmap.width;
        self.offscreen.height = bitmap.height;
        self.ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
        //ctx.transferFromImageBitmap(bitmap); 
    });

    self.postMessage({timestamp: event.data.inbox.timestamp});
});