import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const planner = path.resolve(here, "../scripts/plan-local-pilot-interface-v1.mjs");

function run(args, extraEnv = {}) {
  return execFileSync(process.execPath, [planner, ...args], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "false", ...extraEnv },
  });
}

test("planner emits sanitized synthetic file plan without reading or exposing paths", () => {
  const output = run([
    "--input-kind", "synthetic",
    "--source", "file",
    "--image", "/private/local/synthetic-face.jpg",
    "--yunet", "/private/local/yunet.onnx",
    "--auraface", "/private/local/auraface.onnx",
  ]);
  const plan = JSON.parse(output);

  assert.equal(plan.localOnly, true);
  assert.equal(plan.planningAccepted, true);
  assert.equal(plan.executionRequested, false);
  assert.equal(plan.executionPerformed, false);
  assert.equal(plan.executionEnabled, true);
  assert.equal(plan.consentedHumanExecutionEnabled, false);
  assert.equal(plan.cameraExecutionEnabled, false);
  assert.equal(plan.githubActionsTransportAllowed, false);
  assert.equal(plan.networkInputAllowed, false);
  assert.equal(plan.inputPathEmitted, false);
  assert.equal(plan.fileNameEmitted, false);
  assert.equal(plan.modelPathEmitted, false);
  assert.equal(plan.embeddingPersisted, false);
  assert.equal(plan.embeddingLogged, false);
  assert.equal(plan.outputVectorExposed, false);
  assert.equal(plan.thresholdAllowed, false);
  assert.equal(plan.identityClaimAllowed, false);
  assert.equal(plan.productionAllowed, false);

  for (const secret of ["synthetic-face.jpg", "yunet.onnx", "auraface.onnx", "/private/local"]) {
    assert.equal(output.includes(secret), false);
  }
});

test("planner accepts consented-human file planning but keeps execution disabled", () => {
  const output = run([
    "--input-kind", "consented-human",
    "--source", "file",
    "--image", "/must/not/read/human.jpg",
    "--yunet", "/must/not/read/yunet.onnx",
    "--auraface", "/must/not/read/auraface.onnx",
  ]);
  const plan = JSON.parse(output);

  assert.equal(plan.planningAccepted, true);
  assert.equal(plan.inputKind, "consented-human");
  assert.equal(plan.sourceKind, "file");
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.consentedHumanExecutionEnabled, false);
  assert.equal(plan.executionPerformed, false);
  assert.equal(output.includes("/must/not/read"), false);
});

test("planner accepts consented-human camera planning but keeps camera execution disabled", () => {
  const output = run([
    "--input-kind", "consented-human",
    "--source", "camera",
    "--image", "camera://local-only",
    "--yunet", "/must/not/read/yunet.onnx",
    "--auraface", "/must/not/read/auraface.onnx",
  ]);
  const plan = JSON.parse(output);

  assert.equal(plan.planningAccepted, true);
  assert.equal(plan.sourceKind, "camera");
  assert.equal(plan.executionEnabled, false);
  assert.equal(plan.cameraExecutionEnabled, false);
  assert.equal(plan.executionPerformed, false);
  assert.equal(output.includes("camera://local-only"), false);
});

test("planner fails closed for synthetic camera source", () => {
  const result = spawnSync(process.execPath, [
    planner,
    "--input-kind", "synthetic",
    "--source", "camera",
    "--image", "camera://must-not-open",
    "--yunet", "/must/not/read/yunet.onnx",
    "--auraface", "/must/not/read/auraface.onnx",
  ], {
    encoding: "utf8",
    env: { ...process.env, GITHUB_ACTIONS: "false" },
  });

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /camera source/);
  assert.equal(result.stdout.includes("camera://must-not-open"), false);
});
