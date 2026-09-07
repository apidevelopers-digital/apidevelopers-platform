#!/usr/bin/env bash
set -euo pipefail

EXPECTED_BYTES="260694151"
EXPECTED_SHA256="a7933ea5330113b01c9b60351d8f4c33003f145d8470ac5f0e52ee2effe25c60"
ARTIFACT="$HOME/.cache/apidevelopers-digital/trust-face/auraface-v1/glintr100.onnx"
OUTPUT="packages/trust-face-engine/docs/AURAFACE_512D_ONNX_CONTRACT_V1.json"

stage_file="${RUNNER_TEMP:-/tmp}/auraface-512d-onnx-inspection-stage"
stage="preflight_started"
printf '%s\n' "$stage" > "$stage_file"

fail_closed() {
  local code=$?
  local current
  current="$(cat "$stage_file" 2>/dev/null || printf unknown)"
  echo "::error title=AuraFace 512D ONNX inspection fail-closed::stage=${current} inferenceExecuted=false benchmarkExecuted=false productionAuthorized=false"
  exit "$code"
}
trap fail_closed ERR

[[ "${RUNNER_OS:-}" == "macOS" && "${RUNNER_ARCH:-}" == "X64" ]]
if [[ "${RUNNER_NAME:-}" != "igor-mac-runner" ]]; then
  echo "::warning title=Trust Face runner drift::canonical=igor-mac-runner actual=${RUNNER_NAME:-unknown}; labels remain macOS/X64"
fi

stage="artifact_integrity_started"
printf '%s\n' "$stage" > "$stage_file"
[[ -f "$ARTIFACT" ]]
bytes="$(stat -f%z "$ARTIFACT")"
sha="$(shasum -a 256 "$ARTIFACT" | awk '{print $1}')"
[[ "$bytes" == "$EXPECTED_BYTES" ]]
[[ "$sha" == "$EXPECTED_SHA256" ]]

stage="parser_prepare_started"
printf '%s\n' "$stage" > "$stage_file"
py_prefix="$(brew --prefix python@3.11 2>/dev/null || true)"
if [[ -n "$py_prefix" && -x "$py_prefix/bin/python3.11" ]]; then
  py311="$py_prefix/bin/python3.11"
elif command -v python3.11 >/dev/null 2>&1; then
  py311="$(command -v python3.11)"
else
  echo "::error title=AuraFace ONNX parser::python3.11 unavailable"
  exit 1
fi

tmp="$(mktemp -d "${RUNNER_TEMP:-/tmp}/auraface-onnx-inspect.XXXXXX")"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT
venv="$tmp/venv"
"$py311" -m venv "$venv"
py="$venv/bin/python"
"$py" -m pip install --disable-pip-version-check --only-binary=:all: "onnx==1.17.0" >/dev/null

stage="graph_inspection_started"
printf '%s\n' "$stage" > "$stage_file"
mkdir -p "$(dirname "$OUTPUT")"
"$py" - "$ARTIFACT" "$OUTPUT" "$EXPECTED_SHA256" "$EXPECTED_BYTES" <<'PY'
import collections
import json
import sys
import onnx
from onnx import TensorProto

artifact, output, expected_sha, expected_bytes = sys.argv[1:5]
model = onnx.load_model(artifact, load_external_data=False)
onnx.checker.check_model(model)

initializers = {item.name for item in model.graph.initializer}

def dims(value_info):
    tensor_type = value_info.type.tensor_type
    result = []
    for d in tensor_type.shape.dim:
        if d.HasField("dim_value"):
            result.append(int(d.dim_value))
        elif d.HasField("dim_param"):
            result.append(d.dim_param)
        else:
            result.append(None)
    return result

def dtype_name(value_info):
    elem = value_info.type.tensor_type.elem_type
    try:
        return TensorProto.DataType.Name(elem).lower()
    except Exception:
        return f"tensorproto_{elem}"

inputs = [
    {"name": v.name, "dtype": dtype_name(v), "shape": dims(v)}
    for v in model.graph.input
    if v.name not in initializers
]
outputs = [
    {"name": v.name, "dtype": dtype_name(v), "shape": dims(v)}
    for v in model.graph.output
]

op_counts = collections.Counter(node.op_type for node in model.graph.node)
consumers = collections.defaultdict(list)
for idx, node in enumerate(model.graph.node):
    for name in node.input:
        consumers[name].append(idx)

entry_path_ops = []
seen_nodes = set()
queue = collections.deque((inp["name"], 0) for inp in inputs)
while queue:
    tensor_name, depth = queue.popleft()
    if depth > 10:
        continue
    for idx in consumers.get(tensor_name, []):
        if idx in seen_nodes:
            continue
        seen_nodes.add(idx)
        node = model.graph.node[idx]
        entry_path_ops.append(node.op_type)
        if node.op_type == "Conv":
            continue
        for out_name in node.output:
            queue.append((out_name, depth + 1))

normalization_ops = {"Sub", "Div", "Mul", "Add", "Mean", "ReduceMean", "BatchNormalization"}
arithmetic_before_conv = [op for op in entry_path_ops if op in normalization_ops]
normalization_detected = len(arithmetic_before_conv) > 0

payload = {
    "version": "trust-face-auraface-512d-onnx-contract/v1",
    "mode": "read-only-graph-inspection",
    "artifact": {
        "bytes": int(expected_bytes),
        "sha256": expected_sha,
        "integrityVerifiedBeforeInspection": True,
        "weightStoredInGitHub": False,
    },
    "parser": {"onnxVersion": onnx.__version__},
    "model": {
        "irVersion": int(model.ir_version),
        "producerName": model.producer_name or None,
        "producerVersion": model.producer_version or None,
        "modelVersion": int(model.model_version),
        "domain": model.domain or None,
        "opsetImports": [
            {"domain": item.domain or "ai.onnx", "version": int(item.version)}
            for item in model.opset_import
        ],
        "inputs": inputs,
        "outputs": outputs,
        "nodeCount": len(model.graph.node),
        "initializerCount": len(model.graph.initializer),
        "operatorTypeCounts": dict(sorted(op_counts.items())),
        "entryPathOperatorTypesUntilFirstConv": entry_path_ops,
        "graphEntryArithmeticOps": arithmetic_before_conv,
        "graphEntryNormalizationDetected": normalization_detected,
    },
    "safety": {
        "inferenceExecuted": False,
        "benchmarkExecuted": False,
        "tensorValuesStored": False,
        "initializerValuesStored": False,
        "biometricPayloadStored": False,
        "thresholdApplied": False,
        "matchedClaimed": False,
        "identityClaimed": False,
        "productionAuthorized": False,
        "productionReady": False,
        "biometricClaimReady": False,
    },
}

with open(output, "w", encoding="utf-8") as fh:
    json.dump(payload, fh, indent=2, sort_keys=True)
    fh.write("\n")

summary = {
    "inputs": inputs,
    "outputs": outputs,
    "opsetImports": payload["model"]["opsetImports"],
    "graphEntryNormalizationDetected": normalization_detected,
    "entryPathOperatorTypesUntilFirstConv": entry_path_ops,
}
print(json.dumps(summary, separators=(",", ":")))
PY

stage="result_validation_started"
printf '%s\n' "$stage" > "$stage_file"
node --input-type=module - "$OUTPUT" <<'NODE'
import fs from "node:fs";

const path = process.argv[2];
const d = JSON.parse(fs.readFileSync(path, "utf8"));
if (d.mode !== "read-only-graph-inspection") throw new Error("unexpected inspection mode");
if (d.artifact.integrityVerifiedBeforeInspection !== true) throw new Error("integrity gate missing");
if (!Array.isArray(d.model.inputs) || d.model.inputs.length < 1) throw new Error("missing ONNX input");
if (!Array.isArray(d.model.outputs) || d.model.outputs.length < 1) throw new Error("missing ONNX output");
for (const [key, value] of Object.entries(d.safety)) {
  if (value !== false) throw new Error(`safety flag ${key} must remain false`);
}
NODE

stage="result_ready"
printf '%s\n' "$stage" > "$stage_file"
trap - ERR
echo "::notice title=AuraFace 512D ONNX contract::readOnly=true integrityVerified=true inferenceExecuted=false benchmarkExecuted=false output=$OUTPUT"
