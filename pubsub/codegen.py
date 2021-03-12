from grpc.tools import protoc

protoc.main(
    (
        '',
        '-I./src/proto',
        '--python_out=./src/proto',
        '--grpc_python_out=./src/proto',
        './src/proto/pubsub.proto',
    )
)