import os
import sys
import time


sys.path.append(os.path.join(os.path.dirname(__file__), "../../pubsub/src/proto"))
import grpc
import pubsub_pb2
import pubsub_pb2_grpc

sys.path.append(os.path.join(os.path.dirname(__file__), "./proto"))
import status_pb2

sys.path.append(os.path.join(os.path.dirname(__file__), "../../server/src/api/proto"))
import primitives_pb2

import cv2



if __name__ == "__main__":

    """
    cv2.imshow("image", image)
    cv2.waitKey(0)
    exit(1)
    """

    with grpc.insecure_channel('[::1]:50051') as channel:
        stub = pubsub_pb2_grpc.PubsubStub(channel)

        for i in range(0, 2332):
            status = status_pb2.Status()
            status.timestamp = i * 33
            status.debug = "status service debug seq_num {}".format(i)
            status.position.CopyFrom(status_pb2.Position32f(x=float(i), y=float(i), z=0.0))

            #message = pubsub_pb2.PubsubMessage(data="Hello From Status Service {}".format(i).encode('utf-8'))
            message = pubsub_pb2.PubsubMessage(timestamp=i*33, data=status.SerializeToString())
            request = pubsub_pb2.PublishRequest(topic='/status/status', message=message)
            res = stub.Publish(request)
            print(status.timestamp)
            print(res)

            # image
            image = cv2.imread("../../backend/assets/test_images/{}.jpg".format(i))
            result, enc_image = cv2.imencode('.jpg', image, [cv2.IMWRITE_JPEG_QUALITY, 70])
            if result == False:
                print('could not encode image')
                exit(1)
    
            image_pb = primitives_pb2.Image()
            image_pb.data = enc_image.tobytes()
            image_pb.mime_type = "image/jpeg"
            message = pubsub_pb2.PubsubMessage(timestamp=i*33, data=image_pb.SerializeToString())
            request = pubsub_pb2.PublishRequest(topic='/status/image', message=message)
            res = stub.Publish(request)
            print(res)

            #image = cv2.imdecode(enc_image, cv2.IMREAD_COLOR)

            time.sleep(0.033)
