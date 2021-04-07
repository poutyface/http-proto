const protobuf = require('protobufjs/light');
const protobufBundle = require("proto_bundle.json");

export const createRequest = (requestType, params={}) => {
    let pb = requestType.create(params);
    return { 
        header: {
            path: requestType.options["(path)"],
        }, 
        ...pb
    };
};

export const getRequestPath = (requestType) => {
    return requestType.options["(path)"];
};

export const delay = (msec) => new Promise(resolve => setTimeout(resolve, msec));

export const protobufRoot = protobuf.Root.fromJSON(protobufBundle);

