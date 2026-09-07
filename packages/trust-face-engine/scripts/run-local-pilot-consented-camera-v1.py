#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import os
import platform
import sys
import time

import cv2
import numpy as np

AURAFACE_BYTES = 260_694_151
AURAFACE_SHA256 = "a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
YUNET_BYTES = 232_589
YUNET_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
CONFIRMATION = "IGOR_APROVA_CAMERA_LOCAL"

ARCFACE_TEMPLATE_112 = np.asarray([
    [38.2946, 51.6963],
    [73.5318, 51.5014],
    [56.0252, 71.7366],
    [41.5493, 92.3655],
    [70.7299, 92.2041],
], dtype=np.float32)

def fail(code, message, exit_code=2):
    print(json.dumps({"ok": False, "code": code, "message": message}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(exit_code)

def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()

def verify_model(path, expected_bytes, expected_sha256, label):
    if not os.path.isfile(path) or os.path.islink(path):
        fail(f"{label}_missing", f"{label} must be a regular non-symlink file")
    if os.path.getsize(path) != expected_bytes:
        fail(f"{label}_size_mismatch", f"{label} size mismatch")
    if sha256_file(path) != expected_sha256:
        fail(f"{label}_sha256_mismatch", f"{label} SHA-256 mismatch")

def create_yunet(path):
    if hasattr(cv2, "FaceDetectorYN_create"):
        return cv2.FaceDetectorYN_create(path, "", (320, 320), 0.70, 0.30, 5000)
    return cv2.FaceDetectorYN.create(path, "", (320, 320), 0.70, 0.30, 5000)

def similarity_transform(src, dst):
    src = np.asarray(src, np.float64)
    dst = np.asarray(dst, np.float64)
    src_mean = src.mean(axis=0)
    dst_mean = dst.mean(axis=0)
    src_centered = src - src_mean
    dst_centered = dst - dst_mean
    variance = np.mean(np.sum(src_centered * src_centered, axis=1))
    if not math.isfinite(float(variance)) or variance <= np.finfo(np.float64).eps:
        fail("alignment_degenerate", "degenerate five-point landmarks")
    covariance = (dst_centered.T @ src_centered) / src.shape[0]
    u, singular, vt = np.linalg.svd(covariance)
    sign = np.ones(2)
    if np.linalg.det(u) * np.linalg.det(vt) < 0:
        sign[-1] = -1.0
    rotation = u @ np.diag(sign) @ vt
    scale = float(np.sum(singular * sign) / variance)
    translation = dst_mean - scale * (rotation @ src_mean)
    matrix = np.zeros((2, 3), np.float64)
    matrix[:, :2] = scale * rotation
    matrix[:, 2] = translation
    if not np.isfinite(matrix).all():
        fail("alignment_non_finite", "alignment transform is non-finite")
    return matrix.astype(np.float32)

def capture_frame(camera_index):
    if os.getenv("GITHUB_ACTIONS", "").lower() == "true":
        fail("github_actions_camera_forbidden", "consented camera pilot must run only on the local operator machine", 45)
    backend = getattr(cv2, "CAP_AVFOUNDATION", 0) if platform.system() == "Darwin" else 0
    capture = cv2.VideoCapture(camera_index, backend)
    if not capture.isOpened():
        capture.release()
        fail("camera_open_failed", "camera could not be opened; check macOS camera permission", 44)
    try:
        capture.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        capture.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        frame = None
        for _ in range(20):
            ok, candidate = capture.read()
            if ok and candidate is not None and candidate.size > 0:
                frame = candidate
            time.sleep(0.03)
        if frame is None:
            fail("camera_frame_unavailable", "camera opened but no frame was available", 44)
        return frame
    finally:
        capture.release()

def run(frame, yunet_path, auraface_path):
    detector = create_yunet(yunet_path)
    height, width = frame.shape[:2]
    detector.setInputSize((int(width), int(height)))
    detected = detector.detect(frame)
    faces = detected[1] if isinstance(detected, tuple) else detected
    if faces is None:
        fail("consented_face_count_not_one", "exactly one consented face is required")
    faces = np.asarray(faces, dtype=np.float32)
    if faces.ndim == 1:
        faces = faces.reshape(1, -1)
    if faces.ndim != 2 or faces.shape[1] != 15 or not np.isfinite(faces).all():
        fail("yunet_output_invalid", "invalid YuNet output")
    if faces.shape[0] != 1:
        fail("consented_face_count_not_one", "exactly one consented face is required")

    landmarks = np.asarray(faces[0][4:14], dtype=np.float32).reshape(5, 2)
    transform = similarity_transform(landmarks, ARCFACE_TEMPLATE_112)
    aligned = cv2.warpAffine(
        frame, transform, (112, 112),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    if aligned is None or aligned.shape != (112, 112, 3):
        fail("alignment_output_invalid", "aligned face must be 112x112x3")

    blob = cv2.dnn.blobFromImage(
        aligned,
        scalefactor=1.0 / 127.5,
        size=(112, 112),
        mean=(127.5, 127.5, 127.5),
        swapRB=True,
        crop=False,
        ddepth=cv2.CV_32F,
    )
    if blob.shape != (1, 3, 112, 112) or blob.dtype != np.float32 or not np.isfinite(blob).all():
        fail("preprocessing_output_invalid", "preprocessed tensor must be finite float32 [1,3,112,112]")

    net = cv2.dnn.readNetFromONNX(auraface_path)
    net.setInput(blob, "data")
    raw = np.asarray(net.forward("1333"), dtype=np.float32)
    if raw.shape != (1, 512):
        fail("auraface_output_shape_invalid", "AuraFace output must be [1,512]")
    if not np.isfinite(raw).all():
        fail("auraface_output_non_finite", "AuraFace output contains non-finite values")

    vector = raw.reshape(-1)
    raw_norm = float(np.linalg.norm(vector))
    if not math.isfinite(raw_norm) or raw_norm <= np.finfo(np.float32).eps:
        fail("auraface_output_zero_norm", "AuraFace output must have finite non-zero norm")
    normalized = vector / raw_norm
    normalized_norm = float(np.linalg.norm(normalized))
    if not math.isfinite(normalized_norm) or abs(normalized_norm - 1.0) > 1e-5:
        fail("auraface_l2_normalization_invalid", "downstream L2 normalization failed")

    del vector, normalized, raw, blob, aligned, frame
    return {
        "version": "trust-face-local-pilot-consented-camera-status/v1",
        "localOnly": True,
        "consentedHumanInput": True,
        "cameraInput": True,
        "executionCompleted": True,
        "detectedFaceCount": 1,
        "landmarkCount": 5,
        "alignment": "112x112",
        "aurafaceOutputDim": 512,
        "outputFinite": True,
        "outputNonZero": True,
        "downstreamL2NormalizationApplied": True,
        "rawImagePersisted": False,
        "rawImageLogged": False,
        "alignedCropPersisted": False,
        "embeddingPersisted": False,
        "embeddingLogged": False,
        "outputVectorExposed": False,
        "benchmarkExecuted": False,
        "thresholdApplied": False,
        "cosineComputed": False,
        "matchedClaimed": False,
        "identityClaimed": False,
        "calibrationMutationPerformed": False,
        "productionAuthorized": False,
        "productionReady": False,
    }

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yunet", required=True)
    parser.add_argument("--auraface", required=True)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--confirm-camera", required=True)
    args = parser.parse_args()

    if platform.system() != "Darwin":
        fail("local_camera_macos_required", "controlled local camera pilot requires macOS")
    if args.confirm_camera != CONFIRMATION:
        fail("camera_confirmation_required", "explicit local camera confirmation token is required", 43)

    verify_model(args.yunet, YUNET_BYTES, YUNET_SHA256, "yunet")
    verify_model(args.auraface, AURAFACE_BYTES, AURAFACE_SHA256, "auraface")
    frame = capture_frame(args.camera_index)
    status = run(frame, args.yunet, args.auraface)
    print(json.dumps(status, separators=(",", ":"), sort_keys=True))

if __name__ == "__main__":
    main()
