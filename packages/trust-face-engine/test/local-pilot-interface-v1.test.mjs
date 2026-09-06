import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  TRUST_FACE_LOCAL_PILOT_INTERFACE_V1,
  assertTrustFaceLocalPilotSanitizedStatusV1,
  createTrustFaceLocalPilotPlanV1,
} from "../src/local-pilot-interface-v1.mjs";

const script = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../scripts/run-local-pilot-interface-v1.sh");

test("contract is local-only and human/camera locked", () => {
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.localOnly, true);
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.githubActionsExecutionAllowed, false);
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.networkInputAllowed, false);
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.syntheticExecutionEnabled, true);
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.consentedHumanExecutionEnabled, false);
  assert.equal(TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.cameraExecutionEnabled, false);
});

test("plans allow local synthetic file but block Actions and human execution", () => {
  const local = createTrustFaceLocalPilotPlanV1({executionRequested:true});
  assert.equal(local.executionAllowed, true);
  assert.equal(local.inputPathEmitted, false);
  assert.equal(local.embeddingPersisted, false);

  const actions = createTrustFaceLocalPilotPlanV1({githubActions:true, executionRequested:true});
  assert.equal(actions.executionAllowed, false);
  assert.equal(actions.blockReason, "github_actions_execution_forbidden");

  const human = createTrustFaceLocalPilotPlanV1({inputKind:"consented-human", executionRequested:true});
  assert.equal(human.executionAllowed, false);
  assert.equal(human.blockReason, "consented_human_execution_requires_separate_gate");
});

test("camera is reserved for consented-human gate", () => {
  assert.throws(
    () => createTrustFaceLocalPilotPlanV1({inputKind:"synthetic", sourceKind:"camera"}),
    (error) => error?.code === "local_pilot_camera_requires_human_gate",
  );
});

test("sanitized status rejects sensitive fields and claims", () => {
  const clean = assertTrustFaceLocalPilotSanitizedStatusV1({
    localInterface:true, inputKind:"synthetic", sourceKind:"file", executionCompleted:true,
    syntheticInputOnly:true, detectedFaceCount:1, landmarkCount:5, alignment:"112x112",
    aurafaceOutputDim:512, benchmarkExecuted:false, thresholdApplied:false,
    identityClaimed:false, calibrationMutationPerformed:false, productionAuthorized:false,
  });
  assert.equal(clean.aurafaceOutputDim, 512);
  assert.throws(
    () => assertTrustFaceLocalPilotSanitizedStatusV1({embedding:[1,2]}),
    (error) => error?.code === "local_pilot_status_sensitive_field_forbidden",
  );
  assert.throws(
    () => assertTrustFaceLocalPilotSanitizedStatusV1({identityClaimed:true}),
    (error) => error?.code === "local_pilot_status_scope_violation",
  );
});

test("launcher syntax and plan-only output are sanitized", () => {
  execFileSync("bash", ["-n", script], {stdio:"pipe"});
  const output = execFileSync("bash", [
    script, "--input-kind","synthetic","--source","file",
    "--image","/private/local/synthetic-face.jpg",
    "--yunet","/private/local/yunet.onnx",
    "--auraface","/private/local/auraface.onnx",
    "--plan-only",
  ], {encoding:"utf8", env:{...process.env, GITHUB_ACTIONS:"false"}});
  const plan = JSON.parse(output);
  assert.equal(plan.localOnly, true);
  assert.equal(plan.executionPerformed, false);
  assert.equal(plan.githubActionsTransportAllowed, false);
  assert.equal(plan.inputPathEmitted, false);
  assert.equal(output.includes("/private/local/synthetic-face.jpg"), false);
  assert.equal(output.includes("yunet.onnx"), false);
  assert.equal(output.includes("auraface.onnx"), false);
});

test("launcher blocks human input before local file access", () => {
  const result = spawnSync("bash", [
    script, "--input-kind","consented-human","--source","file",
    "--image","/must/not/read.jpg","--yunet","/must/not/read-yunet.onnx","--auraface","/must/not/read-auraface.onnx",
  ], {encoding:"utf8", env:{...process.env, GITHUB_ACTIONS:"false"}});
  assert.equal(result.status, 43);
  assert.match(result.stderr, /consented_human_execution_requires_separate_gate/);
  assert.equal(result.stderr.includes("/must/not/read.jpg"), false);
});
