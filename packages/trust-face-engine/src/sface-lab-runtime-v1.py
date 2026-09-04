import argparse
import json
import sys

import cv2 as cv
import numpy as np

EXPECTED_EMBEDDING_DIM = 128


def fail(message, code=2):
    print(json.dumps({"error": message}), file=sys.stderr)
    raise SystemExit(code)


def parse_args():
    parser = argparse.ArgumentParser(description="Trust Face SFace lab runtime v1")
    parser.add_argument("--model", required=True)
    parser.add_argument("--image", required=True)
    parser.add_argument("--face-box-json", required=True)
    return parser.parse_args()


def main():
    args = parse_args()

    try:
        face_box = json.loads(args.face_box_json)
    except json.JSONDecodeError:
        fail("invalid_face_box_json")

    if not isinstance(face_box, list) or len(face_box) != 14:
        fail("face_box_must_have_14_values")

    try:
        face = np.asarray(face_box, dtype=np.float32)
    except (TypeError, ValueError):
        fail("invalid_face_box_values")

    if not np.isfinite(face).all():
        fail("non_finite_face_box")
    if face[2] <= 0 or face[3] <= 0:
        fail("invalid_face_box_size")

    image = cv.imread(args.image, cv.IMREAD_COLOR)
    if image is None or image.size == 0:
        fail("image_decode_failed")

    if hasattr(cv, "FaceRecognizerSF_create"):
        create_recognizer = cv.FaceRecognizerSF_create
    elif hasattr(cv, "FaceRecognizerSF") and hasattr(cv.FaceRecognizerSF, "create"):
        create_recognizer = cv.FaceRecognizerSF.create
    else:
        fail("opencv_sface_api_unavailable")

    try:
        recognizer = create_recognizer(args.model, "")
        aligned = recognizer.alignCrop(image, face)
        features = recognizer.feature(aligned)
    except cv.error:
        fail("opencv_sface_inference_failed")

    vector = np.asarray(features, dtype=np.float32).reshape(-1)
    if vector.size != EXPECTED_EMBEDDING_DIM or not np.isfinite(vector).all():
        fail(f"invalid_sface_embedding_dim:{int(vector.size)}")

    norm = float(np.linalg.norm(vector))
    if not np.isfinite(norm) or norm <= np.finfo(np.float32).eps:
        fail("zero_sface_embedding")

    vector = vector / norm

    print(json.dumps({
        "version": "trust-face-sface-python-runtime/v1",
        "provider": "opencv.FaceRecognizerSF",
        "cvVersion": cv.__version__,
        "alignedWithFiveLandmarks": True,
        "embeddingDim": int(vector.size),
        "embedding": vector.astype(float).tolist(),
        "embeddingStored": False,
        "rawBiometricPayloadStored": False,
        "productionReady": False,
        "biometricClaimReady": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
