#!/usr/bin/env bash

# for rust
echo "generate rust code from .proto"
protoc -I./src --rust_out=./src src/*.proto

# for js
echo "generate proto_bundle.json"
pbjs -t json src/*.proto > ../web/src/proto_bundle.json
