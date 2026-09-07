import argparse
import json
import sys

import cv2 as cv
import numpy as np


def fail(message, code=2):
    print(json.dumps({"error": message}), file=sys.stderr)
    raise SystemExit(code)


def parse_args():
    parser = argparse.ArgumentParser(description="Trust Face YuNet lab runtime v1")
    parser.add_argument("--model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--score-threshold", required=True, type=float)
    parser.add_argument("--nms-threshold", required=True, type=float)
    parser.add_argument("--top-k", required=True, type=int)
    return parser.parse_args()


def create_detector(model, input_size, score_threshold, nms_threshold, top_k):
    if hasattr(cv, "FaceDetectorYN_create"):
        return cv.FaceDetectorYN_create(
            model, "", input_size, score_threshold, nms_threshold, top_k
        )
    if hasattr(cv, "FaceDetectorYN") and hasattr(cv.FaceDetectorYN, "create"):
        return cv.FaceDetectorYN.create(
            model, "", input_size, score_threshold, nms_threshold, top_k
        )
    fail("opencv_yunet_api_unavailable")


def main():
    args = parse_args()

    if not (0.0 <= args.score_threshold <= 1.0):
        fail("invalid_score_threshold")
    if not (0.0 <= args.nms_threshold <= 1.0):
        fail("invalid_nms_threshold")
    if args.top_k <= 0:
        fail("invalid_top_k")

    image = cv.imread(args.image, cv.IMREAD_COLOR)
    if image is None or image.size == 0:
        fail("image_decode_failed")

    height, width = image.shape[:2]
    detector = create_detector(
        args.model,
        (int(width), int(height)),
        args.score_threshold,
        args.nms_threshold,
        args.top_k,
    )

    try:
        result = detector.detect(image)
    except cv.error:
        fail("opencv_yunet_detection_failed")

    faces = result[1] if isinstance(result, tuple) else result
    if faces is None:
        fail("no_face_detected")

    faces = np.asarray(faces, dtype=np.float32)
    if faces.ndim == 1:
        faces = faces.reshape(1, -1)
    if faces.ndim != 2 or faces.shape[0] < 1 or faces.shape[1] != 15:
        fail("invalid_yunet_output_shape")
    if not np.isfinite(faces).all():
        fail("non_finite_yunet_output")

    selected_index = int(np.argmax(faces[:, 14]))
    selected = faces[selected_index]
    if float(selected[2]) <= 0 or float(selected[3]) <= 0:
        fail("invalid_yunet_bbox")

    print(json.dumps({
        "version": "trust-face-yunet-python-runtime/v1",
        "provider": "opencv.FaceDetectorYN",
        "cvVersion": cv.__version__,
        "detectionCount": int(faces.shape[0]),
        "selectedIndex": selected_index,
        "selectedScore": float(selected[14]),
        "faceBox": selected.astype(float).tolist(),
        "rawBiometricPayloadStored": False,
        "productionReady": False,
        "biometricClaimReady": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
