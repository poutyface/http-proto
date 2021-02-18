from grpc.tools import protoc

protoc.main(
    (
        '',
        '-I./proto',
        '--python_out=./proto',
        '--grpc_python_out=./proto',
        './proto/pubsub.proto',
    )
)