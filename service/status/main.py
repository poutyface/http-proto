import os
import sys
import time


sys.path.append(os.path.join(os.path.dirname(__file__), "../../pubsub/src/proto"))
import grpc
import pubsub_pb2
import pubsub_pb2_grpc

sys.path.append(os.path.join(os.path.dirname(__file__), "./proto"))
import status_pb2



if __name__ == "__main__":
    with grpc.insecure_channel('[::1]:50051') as channel:
        stub = pubsub_pb2_grpc.PubsubStub(channel)

        for i in range(0, 1000):
            status = status_pb2.Status()
            status.timestamp = i
            status.debug = "status service debug seq_num {}".format(i)
            status.position.CopyFrom(status_pb2.Position32f(x=float(i), y=float(i), z=0.0))

            #message = pubsub_pb2.PubsubMessage(data="Hello From Status Service {}".format(i).encode('utf-8'))
            message = pubsub_pb2.PubsubMessage(data=status.SerializeToString())
            request = pubsub_pb2.PublishRequest(topic='status', message=message)
            res = stub.Publish(request)
            print(res)

            time.sleep(0.033)
