const protobuf = require('protobufjs/light');
const protoBundle = require("./proto_bundle.json");
const protoRoot = protobuf.Root.fromJSON(protoBundle);
//const imageUpdate = protoRoot.lookupType("ImageUpdate");

var offscreen = null;
var ctx = null;

self.addEventListener('message', (event) => {
    if (event.data.type == 'initialize'){
        offscreen = event.data.canvas;
        ctx = offscreen.getContext("2d");
        //ctx = offsecreen.getContext("bitmaprenderer");
        return;
    } 
    /*
    const data = event.data.data;
    let message = imageUpdate.decode(new Uint8Array(data));
    */
    const message = event.data.data;
    // encode base64, and set image src
    //let image = `data:image/jpeg;base64,${btoa(String.fromCharCode.apply(null,obj.image))}`;
    //let obj = imageUpdate.toObject(message, {enums: String, bytes: String});
    //self.postMessage(obj);

    var blob = new Blob([message.image], { type: "image/jpeg" });
    //var blob = new Blob([message.image], { type: "image/avif" });

    var bitmap = self.createImageBitmap(blob);
    bitmap.then(bitmap => {
        offscreen.width = bitmap.width * 2;
        offscreen.height = bitmap.height * 2;
        ctx.drawImage(bitmap, 0, 0, bitmap.width * 2, bitmap.height * 2);
        //ctx.transferFromImageBitmap(bitmap); 
    });
});