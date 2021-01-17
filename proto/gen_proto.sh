#!/usr/bin/env bash

# for rust
echo "generate rust code from .proto"
protoc -I./src --rust_out=./src src/*.proto
proto_list="./src/*.proto"
rm -fr ./src/lib.rs
touch ./src/lib.rs
for file in ${proto_list[@]}; do
    echo "pub mod `basename ${file} .proto`;" >> ./src/lib.rs
done 

# for js
echo "generate proto_bundle.json"
pbjs -t json src/*.proto > ../web/src/proto_bundle.json
