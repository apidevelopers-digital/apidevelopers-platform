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
YUNET_SCORE_THRESHOLD = 0.70

FIXTURE_EXPECTED_BYTES = 464_641
FIXTURE_EXPECTED_SHA1 = "c958568ff4ade1e3144be3cc1d6bcfcba0f73200"
FIXTURE_SOURCE_PAGE = "https://commons.wikimedia.org/wiki/File:This_Person_Does_Not_Exist_example.jpg"
FIXTURE_LICENSE = "public-domain-pd-algorithm"
FIXTURE_GENERATOR = "StyleGAN2"

ARCFACE_TEMPLATE_112 = np.array(
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


def digest_file(path, algorithm):
    h = hashlib.new(algorithm)
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def verify_regular_file(path, expected_bytes, algorithm, expected_digest, code_prefix):
    if not os.path.isfile(path) or os.path.islink(path):
        fail(f"{code_prefix}_missing", f"{code_prefix} must be a regular non-symlink file")
    actual_bytes = os.path.getsize(path)
    if actual_bytes != expected_bytes:
        fail(f"{code_prefix}_size_mismatch", f"{code_prefix} byte size mismatch")
    actual_digest = digest_file(path, algorithm)
    if actual_digest != expected_digest:
        fail(f"{code_prefix}_{algorithm}_mismatch", f"{code_prefix} {algorithm} mismatch")


def solve_similarity(src, dst):
    # Least-squares 2D similarity:
    # x' = a*x - b*y + tx
    # y' = b*x + a*y + ty
    src = np.asarray(src, dtype=np.float64)
    dst = np.asarray(dst, dtype=np.float64)
    if src.shape != (5, 2) or dst.shape != (5, 2):
        fail("alignment_landmark_shape_invalid", "five 2D source and destination landmarks are required")
    a_rows = []
    b_values = []
    for (x, y), (xp, yp) in zip(src, dst):
        a_rows.append([x, -y, 1.0, 0.0])
        b_values.append(xp)
        a_rows.append([y, x, 0.0, 1.0])
        b_values.append(yp)
    matrix, *_ = np.linalg.lstsq(
        np.asarray(a_rows, dtype=np.float64),
        np.asarray(b_values, dtype=np.float64),
        rcond=None,
    )
    aa, bb, tx, ty = matrix.tolist()
    affine = np.array([[aa, -bb, tx], [bb, aa, ty]], dtype=np.float32)
    if affine.shape != (2, 3) or not np.isfinite(affine).all():
        fail("alignment_transform_invalid", "similarity transform must be finite 2x3")
    scale = math.sqrt(aa * aa + bb * bb)
    if not math.isfinite(scale) or scale <= np.finfo(np.float32).eps:
        fail("alignment_scale_invalid", "similarity transform must have finite non-zero scale")
    return affine, scale


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--image", required=True)
    parser.add_argument("--yunet", required=True)
    parser.add_argument("--auraface", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    verify_regular_file(
        args.auraface,
        AURFAFACE_BYTES,
        "sha256",
        AURAFACE_SHA256,
        "auraface_model",
    )
    verify_regular_file(
        args.yunet,
        YUNET_BYTES,
        "sha256",
        YUNET_SHA256,
        "yunet_model",
    )
    verify_regular_file(
        args.image,
        FIXTURE_EXPECTED_BYTES,
        "sha1",
        FIXTURE_EXPECTED_SHA1,
        "synthetic_fixture",
    )

    image = cv2.imread(args.image, cv2.IMREAD_COLOR)
    if image is None or image.ndim != 3 or image.shape[2] != 3:
        fail("synthetic_fixture_decode_failed", "synthetic fixture must decode as a 3-channel image")
    height, width = image.shape[:2]
    if width <= 0 or height <= 0:
        fail("synthetic_fixture_dimensions_invalid", "synthetic fixture dimensions must be positive")

    detector = cV2.FaceDetectorYN.create(
        args.yunet,
      "",
        (int(width), int(height)),
        YUNET_SCORE_THRESHOLD,
        0.3,
        5000,
    )
    detector.setInputSize((int(width), int(height)))
    _, faces = detector.detect(image)
    if faces is None:
        face_count = 0
    else:
        faces = np.asarray(faces, dtype=np.float32)
        face_count = int(faces.shape[0])

    if face_count != 1:
        fail("synthetic_fixture_face_count_invalid", f"expected exactly one synthetic face, got {face_count}")

    face = faces[0]
    if face.shape[0] < 15 or not np.isfinite(face[:15]).all():
        fail("yunet_detection_invalid", "YuNet detection row must contain finite bbox, five landmarks and score")

    detection_score = float(face[14])
    if detection_score < YUNET_SCORE_THRESHOLD:
        fail("yunet_detection_score_invalid", "YuNet detection score is below the pinned threshold")

    # YuNet ordering: right eye, left eye, nose, right mouth, left mouth.
    # ArcFace template ordering: left eye, right eye, nose, left mouth, right mouth.
    landmarks = np.array(
        [
            face[6:8],
            face[4:6],
            face[8:10],
            face[12:14],
            face[10:12],
        ],
        dtype=np.float32,
    )
    if landmarks.shape != (5, 2) or not np.isfinite(landmarks).all():
        fail("yunet_landmarks_invalid", "YuNet must provide five finite landmarks")

    affine, similarity_scale = solve_similarity(landmarks, ARCFACE_TEMPLATE_112)
    aligned = cv2.warpAffine(
        image,
        affine,
        (112, 112),
        flags=cv2.INTER_LINEAR,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )
    if aligned.shape != (112, 112, 3) or aligned.dtype != np.uint8:
        fail("alignment_output_invalid", "aligned synthetic face must be uint8 112x112x3")

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
        fail("preprocessing_tensor_invalid", "preprocessed AuraFace input must be finite float32 [1,3,112,112]")

    net = cv2.dnn.readNetFromONNX(args.auraface)
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
        "version": "trust-face-auraface-512d-synthetic-face-pipeline-receipt/v1",
        "mode": "controlled-pilot-gate-synthetic-only",
        "fixture": {
            "sourcePage": FIXTURE_SOURCE_PAGE,
            "licenseEvidence": FIXTURE_LICENSE,
            "generator": FIXTURE_GENERATOR,
            "sha1": f"sha1:{FIXTURE_EXPECTED_SHA1}",
            "bytes": FIXTURE_EXPECTED_BYTES,
            "imageWidth": int(width),
            "imageHeight": int(height),
            "syntheticFaceInputUsed": True,
            "realPersonBiometricInputUsed": False,
            "fixtureStoredInGitHub": False,
        },
        "yunet": {
            "sourceRevision": YUNET_SOURCE_REVISION,
            "artifactBytes": YUNET_BYTES,
            "artifactSha256": f"sha256:{YUNET_SHA256}",
            "scoreThreshold": YUNET_SCORE_THRESHOLD,
            "faceCount": face_count,
            "landmarkCount": 5,
            "detectionFinite": True,
            "detectionScore": round(detection_score, 8),
            "landmarksStored": False,
        },
        "alignment": {
            "method": "least-squares-2d-similarity-five-point-arcface-template",
            "targetWidth": 112,
            "targetHeight": 112,
            "transformFinite": True,
            "similarityScalePositive": bool(similarity_scale > 0),
            "alignedCropStored": False,
        },
        "auraface": {
            "modelId": AURFAFACE_MODEL_ID,
            "sourceRevision": AURAFACE_SOURCE_REVISION,
            "artifactBytes": AURFACE_BYTES,
            "artifactSha256": f"sha256:{AURAFACE_SHA256}",
            "inputShape": [1, 3, 112, 112],
            "inputDtype": "float32",
            "outputShape": [1, 512],
            "outputDtype": "float32",
            "outputFinite": True,
            "outputNonZero": True,
            "downstreamL2NormalizationApplied": True,
            "normalizedL2Norm": round(normalized_norm, 8),
            "embeddingStored": False,
            "embeddingLogged": False,
        },
        "runtime": {
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
        },
        "safety": {
            "syntheticLicensedInputOnly": True,
            "realPersonBiometricInputUsed": False,
            "rawHumanImageStored": False,
            "alignedCropStored": False,
            "embeddingStored": False,
            "embeddingLogged": False,
            "pairComparisonExecuted": False,
            "cosineCalculated": False,
            "benchmarkExecuted": False,
            "thresholdApplied": False,
            "matchedClaimed": False,
            "identityClaimed": False,
            "calibrationMutationPerformed": False,
            "farFmrFrrFnmrClaimed": False,
            "productionAuthorized": False,
            "productionReady": False,
            "biometricClaimReady": False,
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print(
        json.dumps(
            {
                "syntheticFacePipelineExecuted": True,
                "syntheticLicensedInputOnly": True,
                "realPersonBiometricInputUsed": False,
                "faceCount": 1,
                "landmarkCount": 5,
                "alignmentExecuted": True,
                "outputShape": [1, 512],
                "outputFinite": True,
                "outputNonZero": True,
                "downstreamL2NormalizationApplied": True,
                "embeddingPersisted": False,
                "benchmarkExecuted": False,
                "thresholdApplied": False,
                "identityClaimed": False,
                "productionAuthorized": False,
            },
            separators=(",", ":"),
        )
    )


if __name__ == "__main__":
    main()
