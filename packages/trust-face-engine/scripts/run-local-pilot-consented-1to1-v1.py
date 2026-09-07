#!/usr/bin/env python3
import argparse
import importlib.util
import json
import math
import os
import platform
import sys
from pathlib import Path

import cv2
import numpy as np

CONFIRMATION = "IGOR_APROVA_1TO1_LOCAL"
PILOT_STATE_DEFAULT = Path.home() / ".cache" / "apidevelopers-digital" / "trust-face" / "pilot-control" / "state"


def fail(code, message, exit_code=2):
    print(json.dumps({"ok": False, "code": code, "message": message}, separators=(",", ":")), file=sys.stderr)
    raise SystemExit(exit_code)


def load_camera_runtime():
    path = Path(__file__).with_name("run-local-pilot-consented-camera-v1.py")
    if not path.is_file():
        fail("camera_runtime_missing", "consented local camera runtime is unavailable")
    spec = importlib.util.spec_from_file_location("trust_face_local_camera_v1", path)
    if spec is None or spec.loader is None:
        fail("camera_runtime_load_failed", "consented local camera runtime could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pilot_enabled():
    state_path = Path(os.environ.get("TRUST_FACE_PILOT_STATE_FILE", str(PILOT_STATE_DEFAULT))).expanduser()
    try:
        state = state_path.read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        state = "disabled"
    return state == "enabled"


def extract_embedding(runtime, frame, yunet_path, auraface_path):
    detector = runtime.create_yunet(yunet_path)
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
    transform = runtime.similarity_transform(landmarks, runtime.ARCFACE_TEMPLATE_112)
    aligned = cv2.warpAffine(
        frame,
        transform,
        (112, 112),
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
    norm = float(np.linalg.norm(vector))
    if not math.isfinite(norm) or norm <= np.finfo(np.float32).eps:
        fail("auraface_output_zero_norm", "AuraFace output must have finite non-zero norm")
    normalized = np.asarray(vector / norm, dtype=np.float32).copy()
    if not np.isfinite(normalized).all():
        fail("auraface_normalized_non_finite", "normalized AuraFace output is non-finite")

    del raw, vector, blob, aligned, frame
    return normalized


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yunet", required=True)
    parser.add_argument("--auraface", required=True)
    parser.add_argument("--camera-index", type=int, default=0)
    parser.add_argument("--confirm-1to1", required=True)
    args = parser.parse_args()

    if platform.system() != "Darwin":
        fail("local_1to1_macos_required", "controlled consented 1:1 pilot requires macOS")
    if os.environ.get("GITHUB_ACTIONS", "").lower() == "true":
        fail("github_actions_1to1_forbidden", "consented 1:1 pilot must run only on the local operator machine", 45)
    if args.confirm_1to1 != CONFIRMATION:
        fail("consented_1to1_confirmation_required", "explicit local consented 1:1 confirmation is required", 43)
    if not pilot_enabled():
        fail("pilot_control_disabled", "controlled pilot kill-switch state must be enabled before 1:1 execution", 42)

    runtime = load_camera_runtime()
    runtime.verify_model(args.yunet, runtime.YUNET_BYTES, runtime.YUNET_SHA256, "yunet")
    runtime.verify_model(args.auraface, runtime.AURAFACE_BYTES, runtime.AURAFACE_SHA256, "auraface")

    print("Enrollment capture: look at the camera.", file=sys.stderr)
    enrollment_frame = runtime.capture_frame(args.camera_index)
    enrollment = extract_embedding(runtime, enrollment_frame, args.yunet, args.auraface)

    print("Enrollment captured. Reposition slightly, then press Enter for the probe capture.", file=sys.stderr)
    try:
        input()
    except EOFError:
        enrollment.fill(0.0)
        fail("probe_confirmation_required", "interactive confirmation is required before probe capture", 43)

    print("Probe capture: look at the camera.", file=sys.stderr)
    probe_frame = runtime.capture_frame(args.camera_index)
    probe = extract_embedding(runtime, probe_frame, args.yunet, args.auraface)

    score = float(np.dot(enrollment, probe))
    score = max(-1.0, min(1.0, score))
    score_finite = math.isfinite(score)

    enrollment.fill(0.0)
    probe.fill(0.0)
    del enrollment, probe

    if not score_finite:
        fail("consented_1to1_score_non_finite", "observed cosine score is non-finite")

    receipt = {
        "version": "trust-face-consented-1to1-pilot-status/v1",
        "localOnly": True,
        "consentedHumanInput": True,
        "cameraInput": True,
        "executionCompleted": True,
        "enrollmentFaceCount": 1,
        "probeFaceCount": 1,
        "landmarkCountPerCapture": 5,
        "alignment": "112x112",
        "aurafaceOutputDim": 512,
        "scoreType": "cosine_similarity",
        "scoreObserved": round(score, 6),
        "scoreFinite": True,
        "thresholdApplied": False,
        "decisionEmitted": False,
        "matchedClaimed": False,
        "identityClaimed": False,
        "livenessEvaluated": False,
        "padEvaluated": False,
        "rawImagePersisted": False,
        "rawImageLogged": False,
        "alignedCropPersisted": False,
        "embeddingPersisted": False,
        "embeddingLogged": False,
        "outputVectorExposed": False,
        "benchmarkExecuted": False,
        "calibrationMutationPerformed": False,
        "productionAuthorized": False,
        "productionReady": False,
    }
    print(json.dumps(receipt, separators=(",", ":"), sort_keys=True))


if __name__ == "__main__":
    main()
