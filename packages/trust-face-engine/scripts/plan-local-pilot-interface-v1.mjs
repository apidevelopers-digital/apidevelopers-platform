#!/usr/bin/env node
import {
  TRUST_FACE_LOCAL_PILOT_INTERFACE_V1,
  createTrustFaceLocalPilotPlanV1,
} from "../src/local-pilot-interface-v1.mjs";

const args = process.argv.slice(2);
const values = new Map();
for (let index = 0; index < args.length; index += 1) {
  const key = args[index];
  if (!key.startsWith("--")) {
    throw Object.assign(new Error("unsupported argument"), { code: "local_pilot_plan_argument_invalid" });
  }
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw Object.assign(new Error(`missing value for ${key}`), { code: "local_pilot_plan_argument_missing" });
  }
  values.set(key, value);
  index += 1;
}

const allowedArgs = new Set(["--input-kind", "--source", "--image", "--yunet", "--auraface"]);
for (const key of values.keys()) {
  if (!allowedArgs.has(key)) {
    throw Object.assign(new Error(`unsupported argument ${key}`), { code: "local_pilot_plan_argument_invalid" });
  }
}

const inputKind = values.get("--input-kind") ?? "synthetic";
const sourceKind = values.get("--source") ?? "file";

const plan = createTrustFaceLocalPilotPlanV1({
  inputKind,
  sourceKind,
  githubActions: process.env.GITHUB_ACTIONS === "true",
  executionRequested: false,
});

const executionEnabled =
  inputKind === "synthetic" &&
  sourceKind === "file" &&
  TRUST_FACE_LOCAL_PILOT_INTERFACE_V1.syntheticExecutionEnabled === true;

const output = Object.freeze({
  version: "trust-face-local-pilot-interface-plan/v1",
  localOnly: true,
  planningAccepted: true,
  inputKind,
  sourceKind,
  executionRequested: false,
  executionPerformed: false,
  executionEnabled,
  consentedHumanExecutionEnabled: false,
  cameraExecutionEnabled: false,
  githubActionsTransportAllowed: false,
  networkInputAllowed: false,
  inputPathEmitted: false,
  fileNameEmitted: false,
  modelPathEmitted: false,
  alignedCropPersisted: false,
  embeddingPersisted: false,
  embeddingLogged: false,
  outputVectorExposed: false,
  benchmarkAllowed: false,
  thresholdAllowed: false,
  identityClaimAllowed: false,
  productionAllowed: false,
  planBlockReason: plan.blockReason,
});

process.stdout.write(`${JSON.stringify(output)}\n`);
