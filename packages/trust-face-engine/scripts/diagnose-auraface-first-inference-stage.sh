#!/usr/bin/env bash
set -euo pipefail

stage_file="${RUNNER_TEMP}/auraface-512d-first-inference-stage"
output="packages/trust-face-engine/docs/AURAFACE_512D_FIRST_INFERENCE_FAILURE_STAGE_V1.json"
mkdir -p "$(dirname "$output")"

if [[ -f "$stage_file" ]]; then
  stage="$(cat "$stage_file")"
  case "$stage" in
    preflight_started|authorized_sample_discovery_started|model_integrity_started|runtime_preparation_started|first_inference_started|evidence_validation_started|first_inference_completed)
      ;;
    *)
      stage="unknown"
      ;;
  esac
  available=true
else
  stage="not_available_on_this_runner"
  available=false
fi

python3 - "$output" "$stage" "$available" "${RUNNER_NAME:-unknown}" "${RUNNER_OS:-unknown}" "${RUNNER_ARCH:-unknown}" <<'PY'
import json
import sys

output, stage, available, runner_name, runner_os, runner_arch = sys.argv[1:7]
payload = {
    "version": "trust-face-auraface-512d-first-inference-failure-stage/v1",
    "sourceRunId": 33950069289,
    "sourceRunConclusion": "failure",
    "stageEvidenceAvailable": available == "true",
    "lastRecordedStage": stage,
    "runner": {
        "name": runner_name,
        "os": runner_os,
        "arch": runner_arch,
    },
    "diagnostic": {
        "inferenceExecutedByDiagnostic": False,
        "benchmarkExecutedByDiagnostic": False,
        "sampleAccessedByDiagnostic": False,
        "modelAccessedByDiagnostic": False,
        "biometricPayloadStored": False,
        "embeddingStored": False,
        "productionAuthorized": False,
    },
}
with open(output, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2, sort_keys=True)
    fh.write("\n")

print(json.dumps({
    "stageEvidenceAvailable": payload["stageEvidenceAvailable"],
    "lastRecordedStage": payload["lastRecordedStage"],
    "runnerName": runner_name,
    "diagnosticInferenceExecuted": False,
}, separators=(",", ":")))
PY
