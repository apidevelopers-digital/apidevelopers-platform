#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BYTES="260694151"
EXPECTED_SHA256="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
SOURCE_REVISION="af6d057c9b0ec4071d4c49c80e3539258798b609"
SOURCE_URL="https://huggingface.co/fal/AuraFace-v1/resolve/${SOURCE_REVISION}/glintr100.onnx?download=true"
CACHE_DIR="$HOME/.cache/apidevelopers-digital/trust-face/auraface-v1"
TARGET="$CACHE_DIR/glintr100.onnx"
PART="$TARGET.part"

stage_file="${RUNNER_TEMP:-/tmp}/auraface-512d-materialization-stage"
stage="preflight_started"
printf '%s\n' "$stage" > "$stage_file"

fail_closed() {
  local code=$?
  local current
  current="$(cat "$stage_file" 2>/dev/null || printf unknown)"
  echo "::error title=AuraFace 512D materialization fail-closed::stage=${current} artifactMaterialized=false benchmarkExecuted=false productionAuthorized=false"
  exit "$code"
}
trap fail_closed ERR

[[ "${RUNNER_OS:-}" == "macOS" && "${RUNNER_ARCH:-}" == "X64" ]]
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}; labels remain macOS/X64"
fi

command -v curl >/dev/null
command -v shasum >/dev/null
command -v node >/dev/null

free_kb="$(df -Pk "$HOME" | awk 'NR==2{print $4}')"
[[ "$free_kb" -ge 1048576 ]]

mkdir -p "$CACHE_DIR"

stage="existing_artifact_check_started"
printf '%s\n' "$stage" > "$stage_file"

verify_shell() {
  local path="$1"
  [[ -f "$path" ]]
  local bytes sha
  bytes="$(stat -f%z "$path")"
  sha="$(shasum -a 256 "$path" | awk '{print $1}')"
  [[ "$bytes" == "$EXPECTED_BYTES" ]]
  [[ "$sha" == "$EXPECTED_SHA256" ]]
}

if verify_shell "$TARGET" 2>/dev/null; then
  echo "::notice title=AuraFace 512D cache::existing verified artifact reused"
else
  rm -f "$PART"
  stage="download_started"
  printf '%s\n' "$stage" > "$stage_file"
  curl --fail --location --retry 5 --retry-all-errors --retry-delay 3 \
    --connect-timeout 30 --output "$PART" "$SOURCE_URL"

  stage="download_integrity_verification_started"
  printf '%s\n' "$stage" > "$stage_file"
  verify_shell "$PART"
  mv "$PART" "$TARGET"
fi

stage="node_verifier_started"
printf '%s\n' "$stage" > "$stage_file"
node --input-type=module - "$TARGET" <<'NODE'
import { verifyAuraFace512dMaterializationV1 } from "./packages/trust-face-engine/src/auraface-512d-materialization-v1.mjs";

const artifactPath = process.argv[2];
const result = await verifyAuraFace512dMaterializationV1({ artifactPath });

if (result.sourceIntegrityVerified !== true) throw new Error("source integrity not verified");
if (result.labInferenceEligible !== true) throw new Error("lab inference should be eligible");
if (result.productEmbeddingDimCompatible !== true) throw new Error("512D product dimension compatibility expected");
if (result.productUseEligible !== false) throw new Error("product use must remain ineligible");
if (result.benchmarkExecutionAuthorized !== false) throw new Error("benchmark must remain unauthorized");
if (result.productionReady !== false) throw new Error("production must remain false");
if (result.biometricClaimReady !== false) throw new Error("biometric claim must remain false");

console.log(JSON.stringify({
  modelId: result.modelId,
  sourceRevision: result.sourceRevision,
  artifactBytes: result.artifactBytes,
  artifactSha256: result.artifactSha256,
  sourceIntegrityVerified: result.sourceIntegrityVerified,
  labInferenceEligible: result.labInferenceEligible,
  productEmbeddingDimCompatible: result.productEmbeddingDimCompatible,
  productUseEligible: result.productUseEligible,
  benchmarkExecutionAuthorized: result.benchmarkExecutionAuthorized,
  productionReady: result.productionReady,
  biometricClaimReady: result.biometricClaimReady,
}));
NODE

stage="materialization_verified"
printf '%s\n' "$stage_file" trap - ERR

echo "::notice title=AuraFace 512D materialization::artifactMaterialized=true integrityVerified=true bytes=${EXPECTED_BYTES} sha256=${EXPECTED_SHA256} benchmarkExecuted=false productionAuthorized=false"
