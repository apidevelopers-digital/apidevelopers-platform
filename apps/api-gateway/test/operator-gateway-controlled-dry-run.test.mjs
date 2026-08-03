import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  DRY_RUN_APPROVAL,
  runControlledDryRun,
} from "../scripts/operator-gateway-controlled-dry-run.mjs";
import {
  verifyControlledDryRunEvidence,
} from "../scripts/verify-operator-gateway-controlled-dry-run.mjs";

test("controlled dry-run is synthetic, sanitized and network-free", async () => {
  const directory = await mkdtemp(join(tmpdir(), "operator-dry-run-"));
  const outputPath = join(directory, "evidence.json");
  const evidence = await runControlledDryRun({
    approval: DRY_RUN_APPROVAL,
    outputPath,
    generatedAt: "2026-08-03T01:00:00.000Z",
  });

  assert.equal(evidence.status, "success");
  assert.equal(evidence.controls.externalRequestCount, 0);
  assert.equal(evidence.controls.externalRequestExecuted, false);
  assert.equal(evidence.controls.githubWriteExecuted, false);
  assert.equal(evidence.controls.realCredentialLoaded, false);
  assert.equal(evidence.controls.syntheticCredentialBytes, 520);
  assert.equal(evidence.controls.vaultLeaseCalls, 1);
  assert.equal(evidence.controls.leaseConsumerCalls, 1);
  assert.equal(evidence.controls.localTransportCalls, 1);
  assert.equal(evidence.controls.rawVaultBytesZeroed, true);
  assert.equal(evidence.controls.transportedBytesZeroed, true);
  assert.equal(evidence.controls.descriptorContainsSecretMaterial, false);
  assert.equal(evidence.controls.descriptorContainsSecretReference, false);
  assert.equal(evidence.controls.productionChanged, false);

  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.deepEqual(persisted, evidence);
  assert.equal(verifyControlledDryRunEvidence(persisted).valid, true);
  const serialized = JSON.stringify(persisted);
  assert.equal(serialized.includes("ghs_"), false);
  assert.equal(serialized.includes("vault://"), false);
  assert.equal(serialized.includes("Bearer "), false);
});

test("controlled dry-run fails closed without exact approval", async () => {
  await assert.rejects(
    () =>
      runControlledDryRun({
        approval: "approved",
        outputPath: join(tmpdir(), "must-not-exist.json"),
      }),
    /approval is missing or invalid/,
  );
});

test("evidence verifier rejects leaked references and token-shaped material", () => {
  const valid = {
    schemaVersion: 1,
    mode: "controlled-dry-run",
    status: "success",
    generatedAt: "2026-08-03T01:00:00.000Z",
    approvalVerified: true,
    trigger: "workflow_dispatch",
    runner: {
      name: "igor-mac-runner",
      labels: ["self-hosted", "macOS", "X64"],
    },
    operation: {
      method: "GET",
      path: "/orgs/apidevelopers-digital",
      organization: "apidevelopers-digital",
    },
    result: {
      status: 200,
      organization: "apidevelopers-digital",
      fixtureSha256: "a".repeat(64),
    },
    controls: {
      vaultBackend: "synthetic-memory",
      referenceAllowlistMatched: true,
      vaultLeaseCalls: 1,
      leaseConsumerCalls: 1,
      localTransportCalls: 1,
      externalRequestCount: 0,
      externalRequestExecuted: false,
      githubWriteExecuted: false,
      realCredentialLoaded: false,
      syntheticCredentialBytes: 520,
      methodAllowed: true,
      pathAllowed: true,
      callerAuthHeaderPresent: false,
      rawVaultBytesZeroed: true,
      transportedBytesZeroed: true,
      descriptorContainsSecretMaterial: false,
      descriptorContainsSecretReference: false,
      productionChanged: false,
    },
  };

  assert.equal(verifyControlledDryRunEvidence(valid).valid, true);
  assert.throws(
    () =>
      verifyControlledDryRunEvidence({
        ...valid,
        leaked: "vault://github/never-log-this",
      }),
    /forbidden pattern detected/,
  );
  assert.throws(
    () =>
      verifyControlledDryRunEvidence({
        ...valid,
        leaked: `ghs_${"A".repeat(40)}`,
      }),
    /forbidden pattern detected/,
  );
});
