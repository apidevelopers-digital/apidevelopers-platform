#!/usr/bin/env bash
set -euo pipefail

CONFIRMATION="${TRUST_FACE_LOCAL_CAMERA_CONFIRM:-}"
[[ "$CONFIRMATION" == "IGOR_APROVA_CAMERA_LOCAL" ]] || {
  echo '{"ok":false,"code":"camera_confirmation_required","message":"set TRUST_FACE_LOCAL_CAMERA_CONFIRM=IGOR_APROVA_CAMERA_LOCAL for the approved local camera pilot"}' >&2
  exit 43
}

[[ "$(uname -s)" == "Darwin" ]] || {
  echo '{"ok":false,"code":"local_camera_macos_required","message":"controlled local camera pilot requires macOS"}' >&2
  exit 2
}

[[ "${GITHUB_ACTIONS:-false}" != "true" ]] || {
  echo '{"ok":false,"code":"github_actions_camera_forbidden","message":"camera pilot must not run in GitHub Actions"}' >&2
  exit 45
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXECUTOR="$SCRIPT_DIR/run-local-pilot-consented-camera-v1.py"
[[ -f "$EXECUTOR" ]] || {
  echo '{"ok":false,"code":"camera_executor_missing","message":"local camera executor is missing"}' >&2
  exit 2
}

PYTHON_BIN="${TRUST_FACE_LOCAL_PYTHON:-}"
if [[ -z "$PYTHON_BIN" ]]; then
  PYTHON_BIN="$(command -v python3.11 || command -v python3 || true)"
fi
[[ -n "$PYTHON_BIN" && -x "$PYTHON_BIN" ]] || {
  echo '{"ok":false,"code":"python_runtime_missing","message":"python3 runtime is required"}' >&2
  exit 2
}

CACHE_ROOT="${TRUST_FACE_LOCAL_CACHE:-$HOME/.cache/apidevelopers-digital/trust-face/local-pilot-camera-v1}"
MODEL_DIR="$CACHE_ROOT/models"
VENV_DIR="$CACHE_ROOT/venv"
mkdir -p "$MODEL_DIR"

AURAFACE="$MODEL_DIR/glintr100.onnx"
YUNET="$MODEL_DIR/face_detection_yunet_2023mar.onnx"
AURAFACE_BYTES=260694151
AURAFACE_SHA256="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
AURAFACE_REV="af6d057c9b0ec4071d4c49c80e3539258798b609"
YUNET_BYTES=232589
YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
YUNET_REV="47534e27c9851bb1128ccc0102f1145e27f23f98"

verify_sha256() {
  local path="$1" bytes="$2" sha="$3"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -f%z "$path")" == "$bytes" ]] || return 1
  [[ "$(shasum -a 256 "$path" | awk '{print $1}')" == "$sha" ]]
}

download_verified() {
  local target="$1" bytes="$2" sha="$3" url="$4"
  if verify_sha256 "$target" "$bytes" "$sha"; then
    return 0
  fi
  rm -f "$target.part"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
    --output "$target.part" "$url"
  verify_sha256 "$target.part" "$bytes" "$sha" || {
    rm -f "$target.part"
    echo '{"ok":false,"code":"model_integrity_failed","message":"downloaded model failed pinned size/SHA-256 verification"}' >&2
    exit 2
  }
  mv "$target.part" "$target"
}

download_verified \
  "$AURAFACE" "$AURAFACE_BYTES" "$AURAFACE_SHA256" \
  "https://huggingface.co/fal/AuraFace-v1/resolve/${AURAFACE_REV}/glintr100.onnx?download=true"

download_verified \
  "$YUNET" "$YUNET_BYTES" "$YUNET_SHA256" \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/${YUNET_REV}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  rm -rf "$VENV_DIR"
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

PY="$VENV_DIR/bin/python"
"$PY" -m pip install --disable-pip-version-check --quiet --upgrade "pip==25.2"
"$PY" -m pip install --disable-pip-version-check --quiet --only-binary=:all: \
  "numpy==2.2.6" "opencv-contrib-python==4.13.0.92"

"$PY" - <<'PY'
import cv2, numpy as np
assert cv2.__version__ == "4.13.0", cv2.__version__
assert np.__version__ == "2.2.6", np.__version__
assert hasattr(cv2, "FaceDetectorYN_create") or hasattr(cv2, "FaceDetectorYN")
assert hasattr(cv2.dnn, "readNetFromONNX")
PY

CAMERA_INDEX="${TRUST_FACE_LOCAL_CAMERA_INDEX:-0}"

exec "$PY" "$EXECUTOR" \
  --yunet "$YUNET" \
  --auraface "$AURAFACE" \
  --camera-index "$CAMERA_INDEX" \
  --confirm-camera "$CONFIRMATION"
