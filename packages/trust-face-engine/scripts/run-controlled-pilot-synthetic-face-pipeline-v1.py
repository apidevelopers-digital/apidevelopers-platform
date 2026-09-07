#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import os
import sys

import cv2
import numpy as np

AURAFACE_BYTES = 260_694_151
AURAFACE_SHA256 = "a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
AURAFACE_MODEL_ID = "fal-auraface-v1-glintr100-512d"
AURAFACE_SOURCE_REVISION = "af6d057c9b0ec4071d4c49c80e3539258798b609"

YUNET_BYTES = 232_589
YUNET_SHA256 = "8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
YUNET_SOURCE_REVISION = "47534e27c9851bb1128ccc0102f1145e27f23f98"

FIXTURE_BYTES = 464_641
FIXTURE_SHA1 = "c958568ff4ade1e3144be3cc1d6bcfcba0f73200"
FIXTURE_SOURCE_PAGE = "https://commons.wikimedia.org/wiki/File:This_Person_Does_Not_Exist_example.jpg"
FIXTURE_SOURCE_OLDID = "1270776662"
FIXTURE_LICENSE = "public-domain-ai-generated"
FIXTURE_KIND = "synthetic-ai-generated-face"

ARCFACE_TEMPLATE_112 = np.asarray(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float32,
)


def fail(code, message):
    print(json.dumps({"error": code, "message": message}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(2)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sha1_file(path):
    digest = hashlib.sha1()
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


def verify_fixture(path):
    if not os.path.isfile(path) or os.path.islink(path):
        fail("synthetic_fixture_missing", "synthetic fixture must be a regular non-symlink file")
    if os.path.getsize(path) != FIXTURE_BYTES:
        fail("synthetic_fixture_size_mismatch", "synthetic fixture size mismatch")
    if sha1_file(path) != FIXTURE_SHA1:
        fail("synthetic_fixture_sha1_mismatch", "synthetic fixture SHA-1 mismatch")


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
        fail("alignment_degenerate", "degenerate synthetic fixture landmarks")

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
        fail("alignment_non_finite", "non-finite alignment transform")
    return matrix.astype(np.float32)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fixture", required=True)
    parser.add_argument("--yunet-model", required=True)
    parser.add_argument("--auraface-model", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    verify_fixture(args.fixture)
    verify_model(args.yunet_model, YUNET_BYTES, YUNET_SHA256, "yunet")
    verify_model(args.auraface_model, AURAFACE_BYTES, AURAFACE_SHA256, "auraface")

    image = cv2.imread(args.fixture, cv2.IMREAD_COLOR)
    if image is None or image.size == 0 or image.ndim != 3 or image.shape[2] != 3:
        fail("synthetic_fixture_decode_failed", "synthetic fixture decode failed")

    detector = create_yunet(args.yunet_model)
    height, width = image.shape[:2]
    detector.setInputSize((int(width), int(height)))
    detected = detector.detect(image)
    faces = detected[1] if isinstance(detected, tuple) else detected
    if faces is None:
        fail("synthetic_face_count_not_one", "exactly one synthetic face is required")
    faces = np.asarray(faces, dtype=np.float32)
    if faces.ndim == 1:
        faces = faces.reshape(1, -1)
    if faces.ndim != 2 or faces.shape[1] != 15 or not np.isfinite(faces).all():
        fail("yunet_output_invalid", "invalid YuNet output")
    if faces.shape[0] != 1:
        fail("synthetic_face_count_not_one", "exactly one synthetic face is required")

    landmarks = np.asarray(faces[0][4:14], dtype=np.float32).reshape(5, 2)
    transform = similarity_transform(landmarks, ARCFACE_TEMPLATE_112)
    aligned = cv2.warpAffine(
        image,
        transform,
        (112, 112),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=0,
    )
    if aligned is None or aligned.shape != (112, 112, 3):
        fail("alignment_output_invalid", "aligned synthetic crop must be 112x112x3")

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

    net = cv2.dnn.readNetFromONNX(args.auraface_model)
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

    receipt = {
        "version": "trust-face-controlled-pilot-synthetic-face-pipeline-evidence/v1",
        "mode": "controlled-pilot-gate-synthetic-only",
        "gate": "synthetic_face_pipeline",
        "gateWeight": 20,
        "executionCompleted": True,
        "fixture": {
            "sourceKind": FIXTURE_KIND,
            "sourcePage": FIXTURE_SOURCE_PAGE,
            "sourcePageOldId": FIXTURE_SOURCE_OLDID,
            "license": FIXTURE_LICENSE,
            "bytes": FIXTURE_BYTES,
            "sha1": FIXTURE_SHA1,
            "sha256Observed": sha256_file(args.fixture),
            "ephemeralLocalInput": True,
            "rawImagePersistedToGitHub": False,
            "rawImageRetainedAfterRun": False,
        },
        "detector": {
            "model": "opencv-zoo-yunet-2023mar",
            "sourceRevision": YUNET_SOURCE_REVISION,
            "artifactBytes": YUNET_BYTES,
            "artifactSha256": f"sha256:{YUNET_SHA256}",
            "detectedFaceCount": 1,
            "landmarkCount": 5,
            "bboxStored": False,
            "landmarkValuesStored": False,
            "detectorScoreStored": False,
        },
        "alignment": {
            "kind": "arcface-5pt-112x112-similarity",
            "outputShape": [112, 112, 3],
            "alignedCropPersisted": False,
        },
        "preprocessing": {
            "formula": "(pixel-127.5)/127.5",
            "swapRB": True,
            "layout": "NCHW",
            "dtype": "float32",
            "inputShape": [1, 3, 112, 112],
        },
        "auraface": {
            "modelId": AURAFACE_MODEL_ID,
            "sourceRevision": AURAFACE_SOURCE_REVISION,
            "artifactBytes": AURAFACE_BYTES,
            "artifactSha256": f"sha256:{AURAFACE_SHA256}",
            "outputShape": [1, 512],
            "outputDtype": "float32",
            "outputFinite": True,
            "outputNonZero": True,
            "downstreamL2NormalizationApplied": True,
            "normalizedL2Norm": round(normalized_norm, 8),
            "rawEmbeddingPersisted": False,
            "normalizedEmbeddingPersisted": False,
            "embeddingLogged": False,
        },
        "runtime": {
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
        },
        "safety": {
            "syntheticInputOnly": True,
            "humanIdentityClaimed": False,
            "benchmarkExecuted": False,
            "thresholdApplied": False,
            "cosineComputed": False,
            "matchedClaimed": False,
            "identityClaimed": False,
            "calibrationMutationPerformed": False,
            "farFmrClaimed": False,
            "frrFnmrClaimed": False,
            "productionAuthorized": False,
            "productionReady": False,
            "biometricCertificationClaimed": False,
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, ensure_ascii=False, indent=2, sort_keys=True)
        handle.write("\n")

    print(json.dumps({
        "syntheticFacePipelineExecuted": True,
        "detectedFaceCount": 1,
        "landmarkCount": 5,
        "alignedCropShape": [112, 112, 3],
        "aurafaceOutputShape": [1, 512],
        "outputFinite": True,
        "outputNonZero": True,
        "l2Normalized": True,
        "rawImagePersistedToGitHub": False,
        "alignedCropPersisted": False,
        "embeddingPersisted": False,
        "benchmarkExecuted": False,
        "thresholdApplied": False,
        "identityClaimed": False,
        "productionAuthorized": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
