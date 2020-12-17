#!/usr/bin/env bash

# for rust
protoc -I./src --rust_out=./src src/*.proto

# for js
pbjs -t json src/*.proto > ../web/src/proto_bundle.json
