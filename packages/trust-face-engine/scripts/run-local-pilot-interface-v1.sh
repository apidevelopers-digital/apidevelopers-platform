#!/usr/bin/env bash
set -euo pipefail

INPUT_KIND=""
SOURCE_KIND=""
IMAGE_PATH=""
YUNET_PATH=""
AURAFACE_PATH=""
PLAN_ONLY=false

fail() {
  printf '{"error":"%s","message":"%s"}\n' "$1" "$2" >&2
}

local_path() {
  [[ -n "$1" && "$1" != "-" && "$1" != *"://"* && "$1" != data:* && "$1" != base64:* ]]
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input-kind) INPUT_KIND="${2:-}"; shift 2 ;;
    --source) SOURCE_KIND="${2:-}"; shift 2 ;;
    --image) IMAGE_PATH="${2:-}"; shift 2 ;;
    --yunet) YUNET_PATH="${2:-}"; shift 2 ;;
    --auraface) AURAFACE_PATH="${2:-}"; shift 2 ;;
    --plan-only) PLAN_ONLY=true; shift ;;
    *) fail "local_pilot_argument_invalid" "unsupported argument"; exit 2 ;;
  esac
done

[[ "$INPUT_KIND" == "synthetic" || "$INPUT_KIND" == "consented-human" ]] || {
  fail "local_pilot_input_kind_invalid" "input kind must be synthetic or consented-human"; exit 2;
}
[[ "$SOURCE_KIND" == "file" || "$SOURCE_KIND" == "camera" ]] || {
  fail "local_pilot_source_kind_invalid" "source must be file or camera"; exit 2;
}

# Human and camera execution remain separate sensitive gates.
if [[ "$INPUT_KIND" == "consented-human" ]]; then
  fail "consented_human_execution_requires_separate_gate" "consented-human input is disabled until a separately approved gate"
  exit 43
fi
if [[ "$SOURCE_KIND" == "camera" ]]; then
  fail "camera_execution_requires_separate_gate" "camera input is disabled until a separately approved gate"
  exit 44
fi

for value in "$IMAGE_PATH" "$YUNET_PATH" "$AURAFACE_PATH"; do
  local_path "$value" || {
    fail "local_pilot_local_path_required" "all inputs must be local paths"; exit 2;
  }
done

if [[ "$PLAN_ONLY" == "true" ]]; then
  printf '%s\n' '{"version":"trust-face-local-pilot-interface-plan/v1","localOnly":true,"inputKind":"synthetic","sourceKind":"file","executionPlanned":true,"executionPerformed":false,"syntheticInputOnly":true,"consentedHumanExecutionEnabled":false,"cameraExecutionEnabled":false,"githubActionsTransportAllowed":false,"networkInputAllowed":false,"inputPathEmitted":false,"fileNameEmitted":false,"alignedCropPersisted":false,"embeddingPersisted":false,"embeddingLogged":false,"outputVectorExposed":false,"benchmarkAllowed":false,"thresholdAllowed":false,"identityClaimAllowed":false,"productionAllowed":false}'
  exit 0
fi

[[ "${GITHUB_ACTIONS:-false}" != "true" ]] || {
  fail "github_actions_execution_forbidden" "local pilot execution is forbidden inside GitHub Actions"; exit 45;
}

for value in "$IMAGE_PATH" "$YUNET_PATH" "$AURAFACE_PATH"; do
  [[ -f "$value" && ! -L "$value" ]] || {
    fail "local_pilot_regular_file_required" "local execution requires regular non-symlink files"; exit 2;
  }
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
EXECUTOR="$SCRIPT_DIR/run-controlled-pilot-synthetic-face-pipeline-v1.py"
[[ -f "$EXECUTOR" ]] || {
  fail "local_pilot_executor_missing" "canonical executor missing"; exit 2;
}

TMP_ROOT="${TMPDIR:-/tmp}/trust-face-local-pilot-v0-$$"
RECEIPT="$TMP_ROOT/receipt.json"
mkdir -p "$TMP_ROOT"
trap 'rm -rf "$TMP_ROOT"' EXIT

python3 "$EXECUTOR" \
  --fixture "$IMAGE_PATH" \
  --yunet-model "$YUNET_PATH" \
  --auraface-model "$AURAFACE_PATH" \
   --output "$RECEIPT" >/dev/null

python3 - "$RECEIPT" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as fh:
    receipt = json.load(fh)

safety = receipt.get("safety", {})
detector = receipt.get("detector", {})
alignment = receipt.get("alignment", {})
auraface = receipt.get("auraface", {})

status = {
    "version": "trust-face-local-pilot-interface-status/v1",
    "localInterface": True,
    "inputKind": "synthetic",
    "sourceKind": "file",
    "executionCompleted": receipt.get("executionCompleted") is True,
    "syntheticInputOnly": safety.get("syntheticInputOnly") is True,
    "detectedFaceCount": detector.get("detectedFaceCount"),
    "landmarkCount": detector.get("landmarkCount"),
    "alignment": "112x112" if alignment.get("outputShape") == [112, 112, 3] else None,
    "aurafaceOutputDim": (auraface.get("outputShape") or [None])[-1],
    "outputFinite": auraface.get("outputFinite") is True,
    "outputNonZero": auraface.get("outputNonZero") is True,
    "downstreamL2NormalizationApplied": auraface.get("downstreamL2NormalizationApplied") is True,
    "inputPathEmitted": False,
    "fileNameEmitted": False,
    "alignedCropPersisted": False,
    "embeddingPersisted": False,
    "embeddingLogged": False,
    "outputVectorExposed": False,
    "benchmarkExecuted": safety.get("benchmarkExecuted") is True,
    "thresholdApplied": safety.get("thresholdApplied") is True,
    "identityClaimed": safety.get("identityClaimed") is True,
    "calibrationMutationPerformed": safety.get("calibrationMutationPerformed") is True,
    "productionAuthorized": safety.get("productionAuthorized") is True,
}

for key in (
    "benchmarkExecuted",
    "thresholdApplied",
    "identityClaimed",
    "calibrationMutationPerformed",
    "productionAuthorized",
):
    if status[key]:
        raise SystemExit(f"scope violation: {key}")

if not status["executionCompleted"] or not status["syntheticInputOnly"]:
    raise SystemExit("synthetic execution contract failed")
if status["detectedFaceCount"] != 1 or status["landmarkCount"] != 5:
    raise SystemExit("detector/landmark contract failed")
if status["alignment"] != "112x112" or status["aurafaceOutputDim"] != 512:
    raise SystemExit("alignment/AuraFace contract failed")
if not (
    status["outputFinite"]
    and status["outputNonZero"]
    and status["downstreamL2NormalizationApplied"]
):
    raise SystemExit("AuraFace output validation failed")

print(json.dumps(status, separators=(",", ":"), sort_keys=True))
PY
