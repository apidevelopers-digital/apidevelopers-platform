#!/usr/bin/env bash
set -euo pipefail

ARCHIVE_BYTES="3137641968"
ARCHIVE_SHA256="d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108"
YUNET_BYTES="232589"
YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
SFACE_BYTES="38696353"
SFACE_SHA256="0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
ZOO_REV="47534e27c9851bb1128ccc0102f1145e27f23f98"
OPENCV_PYTHON_TAG="92"
OPENCV_PYTHON_COMMIT="4ddfc013fd1f13d9b9e379dbebf2cdbeb052e7f8"
NUMPY_VERSION="2.2.6"

stage_file="${RUNNER_TEMP:?}/controlface10k-source-benchmark-stage"
stage="bootstrap_started"
printf '%s\n' "$stage" > "$stage_file"

fail_closed() {
  local code=$?
  local current
  current="$(cat "$stage_file" 2>/dev/null || printf unknown)"
  echo "::error title=ControlFace10K source benchmark fail-closed::stage=${current} benchmarkExecuted=$([[ "$current" == benchmark_completed || "$current" == result_validation_started || "$current" == aggregate_persisted ]] && echo true || echo false)"
  exit "$code"
}
trap fail_closed ERR

auth="packages/trust-face-engine/docs/CONTROLFACE10K_BENCHMARK_AUTHORIZATION_V1.md"
for line in \
  "benchmarkExecutionApproved: true" \
  "calibrationMutationAllowed: false" \
  "thresholdCalibrationAllowed: false" \
  "identityClaimAllowed: false" \
  "productionAllowed: false"; do
  grep -Fx "$line" "$auth"
done

[[ "${RUNNER_OS:-}" == "macOS" && "${RUNNER_ARCH:-}" == "X64" ]]
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}; labels remain macOS/X64"
fi

archive="$HOME/.cache/apidevelopers-digital/trust-face/controlface10k/controlface10k.zip"
stage="archive_verification_started"; printf '%s\n' "$stage" > "$stage_file"
test -f "$archive"
bytes="$(stat -f%z "$archive")"
sha="$(shasum -a 256 "$archive" | awk '{print $1}')"
[[ "$bytes" == "$ARCHIVE_BYTES" ]]
[[ "$sha" == "$ARCHIVE_SHA256" ]]

stage="source_build_preflight_started"; printf '%s\n' "$stage" > "$stage_file"
py_prefix="$(brew --prefix python@3.11)"
py311="$py_prefix/bin/python3.11"
test -x "$py311"
command -v git >/dev/null
command -v cmake >/dev/null
command -v ninja >/dev/null
command -v clang >/dev/null

free_kb="$(df -Pk "$RUNNER_TEMP" | awk 'NR==2{print $4}')"
[[ "$free_kb" -ge 31457280 ]]

tmp="$(mktemp -d "$RUNNER_TEMP/controlface10k-opencv413.XXXXXX")"
cleanup() {
  rm -rf "$tmp"
}
trap cleanup EXIT
export PIP_CACHE_DIR="$tmp/pip-cache"
export XDG_CACHE_HOME="$tmp/xdg-cache"
mkdir -p "$PIP_CACHE_DIR" "$XDG_CACHE_HOME"

venv="$tmp/venv"
src="$tmp/opencv-python"
wheelhouse="$tmp/wheelhouse"
models="$tmp/models"
mkdir -p "$wheelhouse" "$models"

stage="venv_prepare_started"; printf '%s\n' "$stage" > "$stage_file"
"$py311" -m venv "$venv"
py="$venv/bin/python"
"$py" -m pip --version >/dev/null
"$py" -m pip install --disable-pip-version-check --upgrade \
  "pip==25.2" "setuptools==80.9.0" "wheel==0.45.1" >/dev/null
"$py" -m pip install --disable-pip-version-check "numpy==$NUMPY_VERSION" >/dev/null

stage="opencv_source_checkout_started"; printf '%s\n' "$stage" > "$stage_file"
git clone --quiet --recursive --branch "$OPENCV_PYTHON_TAG" \
  https://github.com/opencv/opencv-python.git "$src"
actual_commit="$(git -C "$src" rev-parse HEAD)"
[[ "$actual_commit" == "$OPENCV_PYTHON_COMMIT" ]]
git -C "$src" submodule status --recursive | grep -Eq '^[ +][0-9a-f]{40} '

stage="opencv_source_build_started"; printf '%s\n' "$stage" > "$stage_file"
export ENABLE_CONTRIB=1
export ENABLE_HEADLESS=1
export CMAKE_GENERATOR=Ninja
export CMAKE_ARGS="-DBUILD_TESTS=OFF -DBUILD_PERF_TESTS=OFF -DBUILD_EXAMPLES=OFF -DBUILD_opencv_apps=OFF"
"$py" -m pip wheel \
  --disable-pip-version-check \
  --no-deps \
  --wheel-dir "$wheelhouse" \
  "$src"

wheel="$(find "$wheelhouse" -maxdepth 1 -type f -name 'opencv_contrib_python_headless-4.13.0.92-*.whl' -print -quit)"
test -n "$wheel"

stage="opencv_runtime_install_started"; printf '%s\n' "$stage" > "$stage_file"
"$py" -m pip install --disable-pip-version-check --no-deps "$wheel" >/dev/null
"$py" - <<'PY'
import cv2
assert cv2.__version__ == "4.13.0", cv2.__version__
assert hasattr(cv2, "FaceDetectorYN_create")
assert hasattr(cv2, "FaceRecognizerSF_create")
print("opencv_runtime_verified=4.13.0")
PY

ensure_model() {
  local path="$1" url="$2" expected_bytes="$3" expected_sha="$4"
  rm -f "$path.part"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 \
    --connect-timeout 30 --output "$path.part" "$url"
  local b h
  b="$(stat -f%z "$path.part")"
  h="$(shasum -a 256 "$path.part" | awk '{print $1}')"
  [[ "$b" == "$expected_bytes" ]]
  [[ "$h" == "$expected_sha" ]]
  mv "$path.part" "$path"
}

stage="model_prepare_started"; printf '%s\n' "$stage" > "$stage_file"
yunet="$models/face_detection_yunet_2023mar.onnx"
sface="$models/face_recognition_sface_2021dec.onnx"

ensure_model \
  "$yunet" \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/$ZOO_REV/models/face_detection_yunet/face_detection_yunet_2023mar.onnx" \
  "$YUNET_BYTES" \
  "$YUNET_SHA256"

ensure_model \
  "$sface" \
  "https://media.githubusercontent.com/media/opencv/opencv_zoo/$ZOO_REV/models/face_recognition_sface/face_recognition_sface_2021dec.onnx" \
  "$SFACE_BYTES" \
  "$SFACE_SHA256"

out="$tmp/controlface10k-benchmark-result-v1.json"
stage="benchmark_started"; printf '%s\n' "$stage" > "$stage_file"

GITHUB_RUN_ID="${GITHUB_RUN_ID:-}" \
GITHUB_SHA="${GITHUB_SHA:-}" \
RUNNER_NAME="${RUNNER_NAME:-}" \
RUNNER_OS="${RUNNER_OS:-}" \
RUNNER_ARCH="${RUNNER_ARCH:-}" \
"$py" packages/trust-face-engine/src/controlface10k-benchmark-v1.py \
  --archive "$archive" \
  --yunet-model "$yunet" \
  --sface-model "$sface" \
  --output "$out" \
  --archive-sha256 "$ARCHIVE_SHA256" \
  --yunet-sha256 "$YUNET_SHA256" \
  --sface-sha256 "$SFACE_SHA256" \
  --source-revision "$ZOO_REV"

test -s "$out"
stage="benchmark_completed"; printf '%s\n' "$stage" > "$stage_file"

stage="result_validation_started"; printf '%s\n' "$stage" > "$stage_file"
"$py" - "$out" "$OPENCV_PYTHON_COMMIT" "$NUMPY_VERSION" <<'PY'
import json, sys
p, source_commit, numpy_version = sys.argv[1:4]
with open(p, encoding="utf-8") as fh:
    d = json.load(fh)

assert d["benchmarkOnly"] is True
assert d["benchmarkExecuted"] is True
assert d["executionCompleted"] is True
assert d["subset"]["selectedIdentityCount"] == 64
assert d["subset"]["selectedImageCount"] == 192
assert d["subset"]["selectedIdentityPathsStored"] is False
assert d["runtime"]["opencvVersion"] == "4.13.0"
assert all(v is False for v in d["privacy"].values())

assert d["safety"] == {
    "bandFrozen": True,
    "biometricClaimReady": False,
    "calibrationMutationAllowed": False,
    "productionAuthorized": False,
    "productionReady": False,
}

frozen = d["scores"]["frozenBand"]
for key in (
    "thresholdApplied",
    "matchedClaimed",
    "identityClaimed",
    "thresholdCalibrated",
    "farFmrValidated",
    "frrFnmrValidated",
):
    assert frozen[key] is False

# Add reproducibility metadata only; no biometric payload is introduced.
d.setdefault("runtimeBuild", {})
d["runtimeBuild"].update({
    "opencvPythonTag": "92",
    "opencvPythonCommit": source_commit,
    "opencvBuiltFromSource": True,
    "opencvBuildTemporary": True,
    "globalInstallPerformed": False,
    "numpyVersion": numpy_version,
})
with open(p, "w", encoding="utf-8") as fh:
    json.dump(d, fh, ensure_ascii=False, indent=2, sort_keys=True)
    fh.write("\n")
PY

target="packages/trust-face-engine/docs/CONTROLFACE10K_BENCHMARK_RESULT_V1.json"
cp "$out" "$target"
git add "$target"

if git diff --cached --quiet; then
  stage="aggregate_unchanged"; printf '%s\n' "$stage" > "$stage_file"
  trap - ERR
  echo "::notice title=ControlFace10K benchmark::benchmarkExecuted=true aggregateChanged=false opencv=4.13.0 sourceBuild=temp"
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "docs(trust): record ControlFace10K benchmark aggregate"
git push origin "HEAD:${GITHUB_REF_NAME}"

stage="aggregate_persisted"; printf '%s\n' "$stage" > "$stage_file"
trap - ERR
echo "::notice title=ControlFace10K benchmark::benchmarkExecuted=true aggregatePersisted=true opencv=4.13.0 sourceBuild=temp"
