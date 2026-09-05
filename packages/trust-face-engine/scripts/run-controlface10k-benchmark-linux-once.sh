#!/usr/bin/env bash
set -euo pipefail

export ARCHIVE_BYTES="3137641968"
export ARCHIVE_SHA256="d0ed28b3271a75ac5bb8e6799fdfe78ba3a91fb7eddecf19d960ed18fe00a108"
export YUNET_BYTES="232589"
export YUNET_SHA256="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
export SFACE_BYTES="38696353"
export SFACE_SHA256="0ba9fbfa01b5270c96627c4ef784da859931e02f04419c829e83484087c34e79"
export ZOO_REV="47534e27c9851bb1128ccc0102f1145e27f23f98"
export PYTHON_IMAGE="python:3.12-slim"

stage_file="${RUNNER_TEMP:?}/controlface-benchmark-linux-stage"
stage="bootstrap_started"
printf '%s\n' "$stage" > "$stage_file"

fail_closed() {
  local code=$?
  local current
  current="$(cat "$stage_file" 2>/dev/null || printf unknown)"
  echo "::error title=ControlFace10K Linux benchmark fail-closed::stage=${current} benchmarkExecuted=$([[ "$current" == benchmark_completed || "$current" == result_validation_started || "$current" == aggregate_persisted ]] && echo true || echo false)"
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

stage="archive_preflight_started"; printf '%s\n' "$stage" > "$stage_file"
[[ "${RUNNER_OS:-}" == "macOS" && "${RUNNER_ARCH:-}" == "X64" ]]
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}"
fi

archive="$HOME/.cache/apidevelopers-digital/trust-face/controlface10k/controlface10k.zip"
test -f "$archive"
bytes="$(stat -f%z "$archive")"
sha="$(shasum -a 256 "$archive" | awk '{print $1}')"
[[ "$bytes" == "$ARCHIVE_BYTES" ]]
[[ "$sha" == "$ARCHIVE_SHA256" ]]

stage="docker_preflight_started"; printf '%s\n' "$stage" > "$stage_file"
command -v docker >/dev/null
docker info >/dev/null
stage="docker_ready"; printf '%s\n' "$stage" > "$stage_file"

stage="model_prepare_started"; printf '%s\n' "$stage" > "$stage_file"
root="$HOME/.cache/apidevelopers-digital/trust-face/controlface10k-benchmark"
models="$root/models"
mkdir -p "$models"

ensure_model() {
  local path="$1" url="$2" expected_bytes="$3" expected_sha="$4"
  if [[ -f "$path" ]]; then
    local b h
    b="$(stat -f%z "$path")"
    h="$(shasum -a 256 "$path" | awk '{print $1}')"
    if [[ "$b" == "$expected_bytes" && "$h" == "$expected_sha" ]]; then
      return 0
    fi
    rm -f "$path"
  fi

  rm -f "$path.part"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 \
    --connect-timeout 30 --output "$path.part" "$url"

  local b h
  b="$(stat -f%z "$path.part")"
  h="$(shasum -a 256 "$path.part" | awk '{print $1}')"
  [[ "$b" == "$expected_bytes" && "$h" == "$expected_sha" ]]
  mv "$path.part" "$path"
}

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

stage="models_ready"; printf '%s\n' "$stage" > "$stage_file"
stage="container_pull_started"; printf '%s\n' "$stage" > "$stage_file"

docker pull --platform linux/amd64 "$PYTHON_IMAGE"
image_id="$(docker image inspect --format '{{.Id}}' "$PYTHON_IMAGE")"
echo "::notice title=Trust Face benchmark container::image=$PYTHON_IMAGE id=$image_id platform=linux/amd64"
stage="container_ready"; printf '%s\n' "$stage" > "$stage_file"

out="$RUNNER_TEMP/controlface10k-benchmark-result-v1.json"
rm -f "$out"
stage="benchmark_started"; printf '%s\n' "$stage" > "$stage_file"

docker run --rm \
  --platform linux/amd64 \
  -e GITHUB_RUN_ID \
  -e GITHUB_SHA \
  -e RUNNER_NAME \
  -e RUNNER_OS \
  -e RUNNER_ARCH \
  -e ARCHIVE_SHA256 \
  -e YUNET_SHA256 \
  -e SFACE_SHA256 \
  -e ZOO_REV \
  -v "$GITHUB_WORKSPACE:/workspace:ro" \
  -v "$archive:/data/controlface10k.zip:ro" \
  -v "$models:/models:ro" \
  -v "$RUNNER_TEMP:/out" \
  -w /workspace \
  "$PYTHON_IMAGE" \
  /bin/sh -lc '
    set -eu
    python -m pip install --disable-pip-version-check --only-binary=:all: "opencv-contrib-python-headless==4.13.0.92" >/dev/null
    python -c "import cv2; assert cv2.__version__ == '\''4.13.0'\'', cv2.__version__"
    python packages/trust-face-engine/src/controlface10k-benchmark-v1.py \
      --archive /data/controlface10k.zip \
      --yunet-model /models/face_detection_yunet_2023mar.onnx \
      --sface-model /models/face_recognition_sface_2021dec.onnx \
      --output /out/controlface10k-benchmark-result-v1.json \
      --archive-sha256 "$ARCHIVE_SHA256" \
      --yunet-sha256 "$YUNET_SHA256" \
      --sface-sha256 "$SFACE_SHA256" \
      --source-revision "$ZOO_REV"
  '

test -s "$out"
stage="benchmark_completed"; printf '%s\n' "$stage" > "$stage_file"

stage="result_validation_started"; printf '%s\n' "$stage" > "$stage_file"
python3 - "$out" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as fh:
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
PY

target="packages/trust-face-engine/docs/CONTROLFACE10K_BENCHMARK_RESULT_V1.json"
cp "$out" "$target"
git add "$target"

if git diff --cached --quiet; then
  stage="aggregate_unchanged"; printf '%s\n' "$stage" > "$stage_file"
  trap - ERR
  exit 0
fi

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "docs(trust): record ControlFace10K benchmark aggregate"
git push origin "HEAD:${GITHUB_REF_NAME}"

stage="aggregate_persisted"; printf '%s\n' "$stage" > "$stage_file"
trap - ERR
