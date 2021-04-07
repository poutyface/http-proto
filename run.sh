#!/usr/bin/env bash


function build_web() {
    (cd web; npm run build)
}

function generate_service_proto() {
    (cd service/status; bash codegen.sh)
}

function stop() {
    pkill -9 -f ./target/release/server
}


case "$1" in
    start)
        stop
        generate_service_proto
        build_web
        cargo build -p server --release || exit -1
        ./target/release/server &
        ;;
    stop)
        stop
        ;;
esac
