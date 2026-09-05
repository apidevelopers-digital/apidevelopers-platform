#!/usr/bin/env bash
set -euo pipefail

A_BYTES="260694151"
A_SHA="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
A_REV="af6d057c9b0ec4071d4c49c80e3539258798b609"
A_URL="https://huggingface.co/fal/AuraFace-v1/resolve/${A_REV}/glintr100.onnx?download=true"
Y_BYTES="232589"
Y_SHA="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
Z_REV="47534e27c9851bb1128ccc0102f1145e27f23f98"
Y_URL="https://media.githubusercontent.com/media/opencv/opencv_zoo/${Z_REV}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"

stage_file="${RUNNER_TEMP:-/tmp}/auraface-512d-first-inference-stage"
stage="preflight_started"
printf '%s\n' "$stage" > "$stage_file"

fail_closed() {
  code=$?
  current="$(cat "$stage_file" 2>/dev/null || printf unknown)"
  echo "::error title=AuraFace 512D first inference fail-closed::stage=${current} inferenceExecuted=false benchmarkExecuted=false thresholdApplied=false identityClaimed=false productionAuthorized=false"
  exit "$code"
}
trap fail_closed ERR

[[ "${RUNNER_OS:-}" == "macOS" && "${RUNNER_ARCH:-}" == "X64" ]]
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}; labels remain macOS/X64"
fi

tmp="$(mktemp -d "${RUNNER_TEMP:-/tmp}/auraface-first-inference.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

stage="authorized_sample_discovery_started"
printf '%s\n' "$stage" > "$stage_file"

cat > "$tmp/allow.txt" <<'HASHES'
fa71e7b451838fad63e9315595693848878e93269c8636f31a17b2d2579dcc99
c82b449b1c8fdc3db7914bd34af873fb44b447a7d8da8d46efd8f9ec84616f3b
a5cddc3c9d0e4f9546d9d0f6bd76f593f46ee6709b84ef3dd78e996a44a55121
9e6d89fda7cb3c2c99edbd550f953803afae879e6999de4ea8d11365d7d3cd2f
8de52069e2a00184a2ec14b87fd1c61bf646dc142ed0c32c6cd94849d5ea84cd
6c1f459d8d89f469f1c3d7ba07e708c184882482d4af5db4a9661a04f0fba069
HASHES

sample=""
for root in \
  "$HOME/.cache/apidevelopers-digital/trust-face/authorized-samples" \
  "$HOME/Downloads" \
  "$HOME/Desktop" \
  "$HOME/Pictures" \
  "/mnt/data"; do
  [[ -d "$root" ]] || continue
  while IFS= read -r candidate; do
    [[ -f "$candidate" && ! -L "$candidate" ]] || continue
    name_hash="$(printf '%s' "$(basename "$candidate")" | shasum -a 256 | awk '{print $1}')"
    if grep -Fxq "$name_hash" "$tmp/allow.txt"; then
      sample="$candidate"
      break
    fi
  done < <(find "$root" -maxdepth 4 -type f \( -iname '*.jpeg' -o -iname '*.jpg' -o -iname '*.png' \) -print 2>/dev/null | sort)
  [[ -z "$sample" ]] || break
done

if [[ -z "$sample" ]]; then
  echo "::error title=AuraFace authorized sample::authorizedSampleFound=false; no approved local sample was found in privacy-scoped roots"
  exit 41
fi
echo "::notice title=AuraFace authorized sample::authorizedSampleFound=true samplePathStored=false fileNameStored=false contentDigestStored=false"

verify_file() {
  path="$1"; expected_bytes="$2"; expected_sha="$3"
  [[ -f "$path" ]]
  [[ "$(stat -f%z "$path")" == "$expected_bytes" ]]
  [[ "$(shasum -a 256 "$path" | awk '{print $1}')" == "$expected_sha" ]]
}

stage="model_integrity_started"
printf '%s\n' "$stage" > "$stage_file"
cache="$HOME/.cache/apidevelopers-digital/trust-face/auraface-v1"
mkdir -p "$cache"
amodel="$cache/glintr100.onnx"
if ! verify_file "$amodel" "$A_BYTES" "$A_SHA" 2>/dev/null; then
  rm -f "$amodel.part"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 --output "$amodel.part" "$A_URL"
  verify_file "$amodel.part" "$A_BYTES" "$A_SHA"
  mv "$amodel.part" "$amodel"
fi

ymodel="$tmp/face_detection_yunet_2023mar.onnx"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 --output "$ymodel" "$Y_URL"
verify_file "$ymodel" "$Y_BYTES" "$Y_SHA"

stage="runtime_preparation_started"
printf '%s\n' "$stage" > "$stage_file"
py_prefix="$(brew --prefix python@3.11 2>/dev/null || true)"
if [[ -n "$py_prefix" && -x "$py_prefix/bin/python3.11" ]]; then
  py311="$py_prefix/bin/python3.11"
elif command -v python3.11 >/dev/null 2>&1; then
  py311="$(command -v python3.11)"
else
  echo "::error title=AuraFace runtime::python3.11 unavailable"
  exit 42
fi

"$py311" -m venv "$tmp/venv"
py="$tmp/venv/bin/python"
"$py" -m pip install --disable-pip-version-check --only-binary=:all: "numpy==2.2.6" "opencv-python-headless==4.13.0.92" >/dev/null
"$py" - <<'PY'
import cv2, numpy as np
assert cv2.__version__ == "4.13.0"
assert hasattr(cv2, "FaceDetectorYN_create") or hasattr(cv2, "FaceDetectorYN")
assert hasattr(cv2.dnn, "readNetFromONNX")
print("runtime_verified=true")
PY

stage="first_inference_started"
printf '%s\n' "$stage" > "$stage_file"
out="$tmp/AURAFACE_512D_FIRST_INFERENCE_EVIDENCE_V1.json"
"$py" packages/trust-face-engine/src/auraface-512d-first-inference-v1.py \
  --sample "$sample" \
  --auraface-model "$amodel" \
  --yunet-model "$ymodel" \
  --output "$out"

stage="evidence_validation_started"
printf '%s\n' "$stage" > "$stage_file"
"$py" - "$out" <<'PY'
import json,sys
with open(sys.argv[1],encoding="utf-8") as f:d=json.load(f)
assert d["execution"]["authorized"] is True
assert d["execution"]["completed"] is True
assert d["execution"]["benchmarkExecuted"] is False
assert d["execution"]["thresholdApplied"] is False
assert d["execution"]["matchedClaimed"] is False
assert d["execution"]["identityClaimed"] is False
assert d["execution"]["productionAuthorized"] is False
assert d["pipeline"]["outputDimension"] == 512
assert d["pipeline"]["outputFinite"] is True
assert d["pipeline"]["downstreamL2NormalizationApplied"] is True
assert d["pipeline"]["rawEmbeddingStored"] is False
assert d["pipeline"]["normalizedEmbeddingStored"] is False
assert d["pipeline"]["cosineComputed"] is False
assert all(v is False for v in d["privacy"].values())
assert d["safety"]["benchmarkExecuted"] is False
assert d["safety"]["productionReady"] is False
assert d["safety"]["biometricClaimReady"] is False
print("evidence_valid=true")
PY

stage="first_inference_completed"
printf '%s\n' "$stage" > "$stage_file"
trap - ERR
echo "::notice title=AuraFace 512D first inference::inferenceExecuted=true outputDimension=512 outputFinite=true l2Normalized=true rawImageStored=false cropStored=false embeddingStored=false benchmarkExecuted=false thresholdApplied=false identityClaimed=false productionAuthorized=false"
