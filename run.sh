#!/usr/bin/env bash

#cd proto && sh gen_proto.sh
cd web && npm run build
cd ../
cargo run --release


