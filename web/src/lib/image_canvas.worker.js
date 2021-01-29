const protobuf = require('protobufjs/light');
const protoBundle = require("proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);

var offscreen = null;
var ctx = null;

self.addEventListener('message', (event) => {
    if (event.data.type == 'initialize'){
        offscreen = event.data.canvas;
        ctx = offscreen.getContext("2d");
        return;
    } 

    const message = event.data.inbox.image;
    // encode base64, and set image src
    //let image = `data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null,obj.image))}`;
    //let obj = imageUpdate.toObject(message, {enums: String, bytes: String});
    //self.postMessage(obj);
    //console.log(event.data.inbox.timestamp);

    var blob = new Blob([message.image], { type: "image/jpeg" });

    var bitmap = self.createImageBitmap(blob);
    bitmap.then(bitmap => {
        offscreen.width = bitmap.width;
        offscreen.height = bitmap.height;
        ctx.drawImage(bitmap, 0, 0, bitmap.width, bitmap.height);
        //ctx.transferFromImageBitmap(bitmap); 
    });

    self.postMessage({timestamp: event.data.inbox.timestamp});
});