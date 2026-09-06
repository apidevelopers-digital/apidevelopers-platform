#!/usr/bin/env bash
set -euo pipefail

AURAFACE_BYTES=260694151
AURAFACE_SHA256="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
AURAFACE_REV="af6d057c9b0ec4071d4c49c80e3539258798b609"
YUNET_BYTES=232589
YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
ZOO_REV="47534e27c9851bb1128ccc0102f1145e27f23f98"
FIXTURE_BYTES=464641
FIXTURE_SHA1="c958568ff4ade1e3144be3cc1d6bcfcba0f73200"
OPENCV_PYTHON_TAG="92"
OPENCV_PYTHON_COMMIT="4ddfc013fd1f13d9b9e379dbebf2cdbeb052e7f8"
NUMPY_VERSION="2.2.6"

WORK="${RUNNER_TEMP:?}/trust-face-controlled-pilot-synthetic"
RUNTIME="${RUNNER_TEMP:?}/trust-face-controlled-pilot-opencv413"
OUT="packages/trust-face-engine/docs/CONTROLLED_PILOT_SYNTHETIC_FACE_PIPELINE_EVIDENCE_V1.json"

cleanup() {
  rm -rf "$WORK" "$RUNTIME"
  echo "::notice title=Controlled Pilot cleanup::syntheticFixtureRetained=false alignedCropRetained=false embeddingRetained=false temporaryModelsRemoved=true temporaryRuntimeRemoved=true"
}
trap cleanup EXIT

if [[ "${RUNNER_OS:-}" != "macOS" || "${RUNNER_ARCH:-}" != "X64" ]]; then
  echo "::error title=Controlled Pilot runner labels::expected macOS/X64"
  exit 2
fi
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}; labels remain macOS/X64"
fi
echo "::notice title=Controlled Pilot gate::gate=synthetic_face_pipeline syntheticInputOnly=true benchmarkExecuted=false thresholdApplied=false identityClaimed=false productionAuthorized=false"

rm -rf "$WORK" "$RUNTIME"
mkdir -p "$WORK/models" "$RUNTIME/pip-cache" "$RUNTIME/xdg-cache" "$RUNTIME/wheelhouse"

verify_sha256() {
  local path="$1" bytes="$2" sha="$3"
  [[ -f "$path" && ! -L "$path" ]]
  [[ "$(stat -f%z "$path")" == "$bytes" ]]
  [[ "$(shasum -a 256 "$path" | awk '{print $1}')" == "$sha" ]]
}

auraface="$WORK/models/glintr100.onnx"
auraface_cache="$HOME/.cache/apidevelopers-digital/trust-face/auraface-v1/glintr100.onnx"
if verify_sha256 "$auraface_cache" "$AURAFACE_BYTES" "$AURAFACE_SHA256"; then
  cp "$auraface_cache" "$auraface"
  echo "::notice title=AuraFace source::verifiedRunnerCache=true ephemeralDownload=false"
else
  url="https://huggingface.co/fal/AuraFace-v1/resolve/${AURAFACE_REV}/glintr100.onnx?download=true"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
    --output "$auraface.part" "$url"
  verify_sha256 "$auraface.part" "$AURAFACE_BYTES" "$AURAFACE_SHA256"
  mv "$auraface.part" "$auraface"
  echo "::notice title=AuraFace source::verifiedRunnerCache=false ephemeralDownload=true"
fi
verify_sha256 "$auraface" "$AURAFACE_BYTES" "$AURAFACE_SHA256"

yunet="$WORK/models/face_detection_yunet_2023mar.onnx"
yunet_url="https://media.githubusercontent.com/media/opencv/opencv_zoo/${ZOO_REV}/models/face_detection_yunet/face_detection_yunet_2023mar.onnx"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
  --output "$yunet.part" "$yunet_url"
verify_sha256 "$yunet.part" "$YUNET_BYTES" "$YUNET_SHA256"
mv "$yunet.part" "$yunet"

fixture="$WORK/synthetic-face.jpg"
fixture_url="https://upload.wikimedia.org/wikipedia/commons/1/1c/This_Person_Does_Not_Exist_example.jpg"
curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 --connect-timeout 30 \
  --output "$fixture.part" "$fixture_url"
[[ "$(stat -f%z "$fixture.part")" == "$FIXTURE_BYTES" ]]
[[ "$(shasum -a 1 "$fixture.part" | awk '{print $1}')" == "$FIXTURE_SHA1" ]]
mv "$fixture.part" "$fixture"
echo "::notice title=Synthetic fixture::source=Wikimedia-Commons publicDomain=true aiGenerated=true bytes=${FIXTURE_BYTES} sha1=${FIXTURE_SHA1}"

py_prefix="$(brew --prefix python@3.11)"
py311="$py_prefix/bin/python3.11"
test -x "$py311"
for command_name in git cmake ninja clang; do command -v "$command_name" >/dev/null; done
free_kb="$(df -Pk "$RUNNER_TEMP" | awk 'NR==2{print $4}')"
[[ "$free_kb" -ge 31457280 ]]

export PIP_CACHE_DIR="$RUNTIME/pip-cache"
export XDG_CACHE_HOME="$RUNTIME/xdg-cache"
venv="$RUNTIME/venv"
src="$RUNTIME/opencv-python"
wheelhouse="$RUNTIME/wheelhouse"

"$py311" -m venv "$venv"
py="$venv/bin/python"
"$py" -m pip install --disable-pip-version-check --upgrade \
  "pip==25.2" "setuptools==80.9.0" "wheel==0.45.1" >/dev/null
"$py" -m pip install --disable-pip-version-check "numpy==$NUMPY_VERSION" >/dev/null

git clone --quiet --recursive --branch "$OPENCV_PYTHON_TAG" \
  https://github.com/opencv/opencv-python.git "$src"
actual_commit="$(git -C "$src" rev-parse HEAD)"
[[ "$actual_commit" == "$OPENCV_PYTHON_COMMIT" ]]
git -C "$src" submodule status --recursive > "$RUNTIME/submodules.txt"
grep -Eq '^[ +][0-9a-f]{40} ' "$RUNTIME/submodules.txt"

export ENABLE_CONTRIB=1
export ENABLE_HEADLESS=1
export CMAKE_GENERATOR=Ninja
export CMAKE_ARGS="-DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_opencv_apps=OFF"

"$py" -m pip wheel --disable-pip-version-check --no-deps \
  --wheel-dir "$wheelhouse" "$src"
wheel="$(find "$wheelhouse" -maxdepth 1 -type f -name 'opencv_contrib_python_headless-4.13.0.92-*.whl' -print -quit)"
test -n "$wheel"
"$py" -m pip install --disable-pip-version-check --no-deps "$wheel" >/dev/null

"$py" - <<'PY'
import cv2, numpy as np
assert cv2.__version__ == "4.13.0", cv2.__version__
assert np.__version__ == "2.2.6", np.__version__
assert hasattr(cv2, "FaceDetectorYN_create") or hasattr(cv2, "FaceDetectorYN")
assert hasattr(cv2.dnn, "readNetFromONNX")
print("controlled_pilot_runtime_verified=true")
PY
echo "::notice title=Controlled Pilot runtime::python=3.11 opencv=4.13.0 numpy=2.2.6 sourceBuildTemporary=true globalInstall=false"

"$py" packages/trust-face-engine/scripts/run-controlled-pilot-synthetic-face-pipeline-v1.py \
  --fixture "$fixture" \
  --yunet-model "$yunet" \
  --auraface-model "$auraface" \
  --output "$OUT"

"$py" - "$OUT" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
    d = json.load(fh)
assert d["gate"] == "synthetic_face_pipeline"
assert d["gateWeight"] == 20
assert d["executionCompleted"] is True
assert d["fixture"]["sourceKind"] == "synthetic-ai-generated-face"
assert d["fixture"]["rawImagePersistedToGitHub"] is False
assert d["fixture"]["rawImageRetainedAfterRun"] is False
assert d["detector"]["detectedFaceCount"] == 1
assert d["detector"]["landmarkCount"] == 5
assert d["detector"]["bboxStored"] is False
assert d["detector"]["landmarkValuesStored"] is False
assert d["alignment"]["outputShape"] == [112, 112, 3]
assert d["alignment"]["alignedCropPersisted"] is False
assert d["auraface"]["outputShape"] == [1, 512]
assert d["auraface"]["outputFinite"] is True
assert d["auraface"]["outputNonZero"] is True
assert d["auraface"]["downstreamL2NormalizationApplied"] is True
assert abs(d["auraface"]["normalizedL2Norm"] - 1.0) <= 1e-5
assert d["auraface"]["rawEmbeddingPersisted"] is False
assert d["auraface"]["normalizedEmbeddingPersisted"] is False
assert d["auraface"]["embeddingLogged"] is False
s = d["safety"]
assert s["syntheticInputOnly"] is True
for key in (
    "humanIdentityClaimed",
    "benchmarkExecuted",
    "thresholdApplied",
    "cosineComputed",
    "matchedClaimed",
    "identityClaimed",
    "calibrationMutationPerformed",
    "farFmrClaimed",
    "frrFnmrClaimed",
    "productionAuthorized",
    "productionReady",
    "biometricCertificationClaimed",
):
    assert s[key] is False, key
print("controlled_pilot_synthetic_face_pipeline_evidence_valid=true")
PY

echo "::notice title=Controlled Pilot synthetic face pipeline::gate=synthetic_face_pipeline executionCompleted=true detectedFaceCount=1 landmarkCount=5 alignment=112x112 aurafaceOutputDim=512 benchmarkExecuted=false thresholdApplied=false identityClaimed=false productionAuthorized=false"
