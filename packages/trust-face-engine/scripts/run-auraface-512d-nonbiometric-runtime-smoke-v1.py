#!/usr/bin/env python3
import argparse
import hashlib
import json
import math
import os
import sys

import cv2
import numpy as np

MODEL_BYTES = 260_694_151
MODEL_SHA256 = "a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
MODEL_ID = "fal-auraface-v1-glintr100-512d"
SOURCE_REVISION = "af6d057c9b0ec4071d4c49c80e3539258798b609"
FIXTURE_GENERATOR = "procedural-rgb-gradient-v1"
FIXTURE_GENERATOR_VERSION = 1


def fail(code, message):
    print(json.dumps({"error": code, "message": message}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(2)


def sha256_file(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model(path):
    if not os.path.isfile(path):
        fail("auraface_model_missing", "pinned AuraFace model is missing")
    if os.path.getsize(path) != MODEL_BYTES:
        fail("auraface_model_size_mismatch", "pinned AuraFace model byte size mismatch")
    if sha256_file(path) != MODEL_SHA256:
        fail("auraface_model_sha256_mismatch", "pinned AuraFace model SHA-256 mismatch")


def procedural_rgb_fixture():
    y, x = np.indices((112, 112), dtype=np.uint32)
    red = (17 * x + 13 * y + 19) % 256
    green = (5 * x + 29 * y + 73) % 256
    blue = (31 * x + 7 * y + 151) % 256
    rgb = np.stack([red, green, blue], axis=2).astype(np.uint8)
    if rgb.shape != (112, 112, 3):
        fail("fixture_shape_invalid", "procedural fixture must remain 112x112x3")
    return rgb


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()

    verify_model(args.model)

    # Fixture is generated in memory and never written to disk.
    rgb = procedural_rgb_fixture()

    # Contract starts from an OpenCV BGR aligned-image convention and uses swapRB=True.
    bgr = np.ascontiguousarray(rgb[:, :, ::-1])
    blob = cv2.dnn.blobFromImage(
        bgr,
        scalefactor=1.0 / 127.5,
        size=(112, 112),
        mean=(127.5, 127.5, 127.5),
        swapRB=True,
        crop=False,
        ddepth=cv2.CV_32F,
    )

    if blob.shape != (1, 3, 112, 112):
        fail("preprocessing_shape_invalid", "preprocessed input must remain [1,3,112,112]")
    if blob.dtype != np.float32 or not np.isfinite(blob).all():
        fail("preprocessing_tensor_invalid", "preprocessed input must be finite float32")

    net = cv2.dnn.readNetFromONNX(args.model)
    net.setInput(blob, "data")
    raw = np.asarray(net.forward("1333"), dtype=np.float32)

    if raw.shape != (1, 512):
        fail("auraface_output_shape_invalid", "AuraFace output must remain [1,512]")
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
        "version": "trust-face-auraface-512d-nonbiometric-runtime-smoke-receipt/v1",
        "mode": "lab-runtime-smoke-nonbiometric",
        "modelId": MODEL_ID,
        "sourceRevision": SOURCE_REVISION,
        "artifactBytes": MODEL_BYTES,
        "artifactSha256": f"sha256:{MODEL_SHA256}",
        "fixtureGenerator": FIXTURE_GENERATOR,
        "fixtureGeneratorVersion": FIXTURE_GENERATOR_VERSION,
        "fixturePersisted": False,
        "inputShape": [1, 3, 112, 112],
        "inputDtype": "float32",
        "outputShape": [1, 512],
        "outputDtype": "float32",
        "outputFinite": True,
        "outputNonZero": True,
        "downstreamL2NormalizationApplied": True,
        "normalizedL2Norm": round(normalized_norm, 8),
        "biometricInputUsed": False,
        "humanFaceInputUsed": False,
        "sampleReferenceUsed": False,
        "faceDetectionExecuted": False,
        "alignmentExecuted": False,
        "embeddingPersisted": False,
        "embeddingLogged": False,
        "benchmarkExecuted": False,
        "thresholdApplied": False,
        "matchedClaimed": False,
        "identityClaimed": False,
        "calibrationMutationPerformed": False,
        "controlledPilotAuthorized": False,
        "productionAuthorized": False,
        "productionReady": False,
        "biometricClaimReady": False,
        "runtime": {
            "opencvVersion": cv2.__version__,
            "numpyVersion": np.__version__,
        },
    }

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w", encoding="utf-8") as handle:
        json.dump(receipt, handle, indent=2, sort_keys=True)
        handle.write("\n")

    print(json.dumps({
        "runtimeSmokeExecuted": True,
        "biometricInputUsed": False,
        "outputShape": [1, 512],
        "outputFinite": True,
        "outputNonZero": True,
        "downstreamL2NormalizationApplied": True,
        "embeddingPersisted": False,
        "benchmarkExecuted": False,
        "thresholdApplied": False,
        "identityClaimed": False,
        "productionAuthorized": False,
    }, separators=(",", ":")))


if __name__ == "__main__":
    main()
