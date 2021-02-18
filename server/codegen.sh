#!/usr/bin/env bash

# for rust
echo "generate rust code from .proto"
protoc -I./src/api/proto --rust_out=./src/api/proto/ ./src/api/proto/*.proto
proto_list="./src/api/proto/*.proto"
rm -fr ./src/api/proto.rs
touch ./src/api/proto.rs
for file in ${proto_list[@]}; do
    echo "pub mod `basename ${file} .proto`;" >> ./src/api/proto.rs
done 

# for js
echo "generate proto_bundle.json"
pbjs -t json src/api/proto/*.proto > ../web/src/proto_bundle.json
