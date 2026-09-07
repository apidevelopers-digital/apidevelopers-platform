#!/usr/bin/env bash
set -euo pipefail

CONFIRMATION="${TRUST_FACE_LOCAL_1TO1_CONFIRM:-}"
[[ "$CONFIRMATION" == "IGOR_APROVA_1TO1_LOCAL" ]] || {
  echo '{"ok":false,"code":"consented_1to1_confirmation_required","message":"set TRUST_FACE_LOCAL_1TO1_CONFIRM=IGOR_APROVA_1TO1_LOCAL for the approved local 1:1 pilot"}' >&2
  exit 43
}

[[ "$(uname -s)" == "Darwin" ]] || {
  echo '{"ok":false,"code":"local_1to1_macos_required","message":"controlled consented 1:1 pilot requires macOS"}' >&2
  exit 2
}

[[ "${GITHUB_ACTIONS:-false}" != "true" ]] || {
  echo '{"ok":false,"code":"github_actions_1to1_forbidden","message":"consented 1:1 pilot must not run in GitHub Actions"}' >&2
  exit 45
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONTROL="$SCRIPT_DIR/trust-face-pilot-control-v1.sh"
EXECUTOR="$SCRIPT_DIR/run-local-pilot-consented-1to1-v1.py"

[[ -f "$CONTROL" && -f "$EXECUTOR" ]] || {
  echo '{"ok":false,"code":"local_1to1_runtime_missing","message":"controlled local 1:1 runtime is incomplete"}' >&2
  exit 2
}

STATE_JSON="$(bash "$CONTROL" status)"
[[ "$STATE_JSON" == *'"state":"enabled"'* ]] || {
  echo '{"ok":false,"code":"pilot_control_disabled","message":"enable the controlled pilot state before consented 1:1 execution"}' >&2
  exit 42
}

CACHE_ROOT="${TRUST_FACE_LOCAL_CACHE:-$HOME/.cache/apidevelopers-digital/trust-face/local-pilot-camera-v1}"
MODEL_DIR="$CACHE_ROOT/models"
VENV_DIR="$CACHE_ROOT/venv"
AURAFACE="$MODEL_DIR/glintr100.onnx"
YUNET="$MODEL_DIR/face_detection_yunet_2023mar.onnx"
AURAFACE_BYTES=260694151
AURAFACE_SHA256="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
YUNET_BYTES=232589
YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"

verify_sha256() {
  local path="$1" bytes="$2" sha="$3"
  [[ -f "$path" && ! -L "$path" ]] || return 1
  [[ "$(stat -f%z "$path")" == "$bytes" ]] || return 1
  [[ "$(shasum -a 256 "$path" | awk '{print $1}')" == "$sha" ]]
}

verify_sha256 "$AURAFACE" "$AURAFACE_BYTES" "$AURAFACE_SHA256" || {
  echo '{"ok":false,"code":"auraface_cache_required","message":"run the validated local camera gate first so the pinned AuraFace model/runtime is available"}' >&2
  exit 2
}
verify_sha256 "$YUNET" "$YUNET_BYTES" "$YUNET_SHA256" || {
  echo '{"ok":false,"code":"yunet_cache_required","message":"run the validated local camera gate first so the pinned YuNet model/runtime is available"}' >&2
  exit 2
}

PY="$VENV_DIR/bin/python"
[[ -x "$PY" ]] || {
  echo '{"ok":false,"code":"local_1to1_python_runtime_missing","message":"validated local camera Python runtime is required"}' >&2
  exit 2
}

"$PY" - <<'PY'
import cv2, numpy as np
assert cv2.__version__ == "4.13.0", cv2.__version__
assert np.__version__ == "2.2.6", np.__version__
assert hasattr(cv2, "FaceDetectorYN_create") or hasattr(cv2, "FaceDetectorYN")
assert hasattr(cv2.dnn, "readNetFromONNX")
PY

CAMERA_INDEX="${TRUST_FACE_LOCAL_CAMERA_INDEX:-0}"

exec "$PY" "$EXECUTOR"   --yunet "$YUNET"  --auraface "$AURAFACE"   --camera-index "$CAMERA_INDEX"   --confirm-1to1 "$CONFIRMATION"
