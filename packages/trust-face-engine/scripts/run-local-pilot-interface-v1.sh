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

# Run before stat/open: human and camera inputs are not enabled in this gate.
if [[ "$INPUT_KIND" == "consented-human" ]]; then
  fail "consented_human_execution_requires_separate_gate" "consented-human input is disabled until a separately approved gate"
  exit 43
fi
if [[ "$SOURCE_KIND" == "camera" ]]; then
  fail "camera_execution_requires_separate_gate" "camera input is disabled until a separately approved gate"
  exit 44
fi

for value in "$IMAGE_PATH" "$YUNET_PATH" "$AURAFACE_PATH"; do
  local_path "$value" || { fail "local_pilot_local_path_required" "all inputs must be local paths"; exit 2; }
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
[[ -f "$EXECUTOR" ]] || { fail "local_pilot_executor_missing" "canonical executor missing"; exit 2; }

TMP_ROOT="${TMPDIR:-/tmp}/trust-face-local-pilot-v0-$$"
RECEIPT="$TMP_ROOT/receipt.json"
mkdir -p "$TMP_ROOT"
trap 'rm -rf "$TMP_ROOT"' EXIT

python3 "$EXECUTOR" --image "$IMAGE_PATH" --yunet "$YUNET_PATH" --auraface "$AURAFACE_PATH" --output "$RECEIPT" >/dev/null

python3 - "$RECEIPT" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    r = json.load(fh)
s = r.get("safety", {})
y = r.get("yunet", {})
a = r.get("alignment", {})
f = r.get("auraface", {})
status = {
    "version":"trust-face-local-pilot-interface-status/v1",
    "localInterface":True,
    "inputKind":"synthetic",
    "sourceKind":"file",
    "executionCompleted":True,
    "syntheticInputOnly":s.get("syntheticLicensedInputOnly") is True,
    "detectedFaceCount":y.get("faceCount"),
    "landmarkCount":y.get("landmarkCount"),
    "alignment":f'{a.get("targetWidth")}x{a.get("targetHeight")}',
    "aurafaceOutputDim":f.get("outputShape",[None,None])[-1],
    "outputFinite":f.get("outputFinite") is True,
    "outputNonZero":f.get("outputNonZero") is True,
    "downstreamL2NormalizationApplied":f.get("downstreamL2NormalizationApplied") is True,
    "inputPathEmitted":False,
    "fileNameEmitted":False,
    "alignedCropPersisted":False,
    "embeddingPersisted":False,
    "embeddingLogged":False,
    "outputVectorExposed":False,
    "benchmarkExecuted":s.get("benchmarkExecuted") is True,
    "thresholdApplied":s.get("thresholdApplied") is True,
    "identityClaimed":s.get("identityClaimed") is True,
    "calibrationMutationPerformed":s.get("calibrationMutationPerformed") is True,
    "productionAuthorized":s.get("productionAuthorized") is True,
}
for key in ("benchmarkExecuted","thresholdApplied","identityClaimed","calibrationMutationPerformed","productionAuthorized"):
    if status[key]:
        raise SystemExit(f"scope violation: {key}")
if status["detectedFaceCount"] != 1 or status["landmarkCount"] != 5:
    raise SystemExit("detector/landmark contract failed")
if status["alignment"] != "112x112" or status["aurafaceOutputDim"] != 512:
    raise SystemExit("alignment/AuraFace contract failed")
if not status["outputFinite"] or not status["outputNonZero"] or not status["downstreamL2NormalizationApplied"]:
    raise SystemExit("AuraFace output validation failed")
print(json.dumps(status, separators=(",",":"), sort_keys=True))
PY
