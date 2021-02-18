#!/usr/bin/env bash

# Generate proto
protoc --proto_path=proto --python_out=proto proto/status.proto

# for rust
echo "generate rust code from .proto"
protoc -I./proto --rust_out=./proto proto/*.proto
