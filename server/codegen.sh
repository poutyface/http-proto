#!/usr/bin/env bash

# for rust
echo "generate rust code from .proto"
protoc -I./src/api/proto -I../google-protobuf/src --rust_out=./src/api/proto/ ./src/api/proto/*.proto
proto_list="./src/api/proto/*.proto"
rm -fr ./src/api/proto/mod.rs
touch ./src/api/proto/mod.rs
for file in ${proto_list[@]}; do
    echo "pub mod `basename ${file} .proto`;" >> ./src/api/proto/mod.rs
done 

# for python
protoc --proto_path=./src/api/proto --proto_path=../google-protobuf/src --python_out=./src/api/proto ./src/api/proto/primitives.proto

# for js
echo "generate proto_bundle.json"
pbjs -t json -p ../google-protobuf/src src/api/proto/*.proto > ../web/src/proto_bundle.json
