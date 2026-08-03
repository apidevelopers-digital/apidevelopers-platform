import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const equal = (actual, expected, name) => {
  if (actual !== expected) {
    throw new Error(`${name} must equal ${JSON.stringify(expected)}`);
  }
};

export function verifyControlledDryRunEvidence(evidence) {
  equal(evidence?.schemaVersion, 1, "schemaVersion");
  equal(evidence?.mode, "controlled-dry-run", "mode");
  equal(evidence?.status, "success", "status");
  equal(evidence?.approvalVerified, true, "approvalVerified");
  equal(evidence?.trigger, "workflow_dispatch", "trigger");
  equal(evidence?.runner?.name, "igor-mac-runner", "runner.name");
  equal(
    JSON.stringify(evidence?.runner?.labels),
    JSON.stringify(["self-hosted", "macOS", "X64"]),
    "runner.labels",
  );
  equal(evidence?.operation?.method, "GET", "operation.method");
  equal(
    evidence?.operation?.path,
    "/orgs/apidevelopers-digital",
    "operation.path",
  );
  equal(
    evidence?.operation?.organization,
    "apidevelopers-digital",
    "operation.organization",
  );
  equal(evidence?.result?.status, 200, "result.status");
  equal(
    evidence?.result?.organization,
    "apidevelopers-digital",
    "result.organization",
  );

  const controls = evidence?.controls ?? {};
  for (const name of [
    "referenceAllowlistMatched",
    "methodAllowed",
    "pathAllowed",
    "rawVaultBytesZeroed",
    "transportedBytesZeroed",
  ]) {
    equal(controls[name], true, `controls.${name}`);
  }
  for (const name of [
    "externalRequestExecuted",
    "githubWriteExecuted",
    "realCredentialLoaded",
    "callerAuthHeaderPresent",
    "descriptorContainsSecretMaterial",
    "descriptorContainsSecretReference",
    "productionChanged",
  ]) {
    equal(controls[name], false, `controls.${name}`);
  }
  equal(controls.vaultBackend, "synthetic-memory", "controls.vaultBackend");
  equal(controls.vaultLeaseCalls, 1, "controls.vaultLeaseCalls");
  equal(controls.leaseConsumerCalls, 1, "controls.leaseConsumerCalls");
  equal(controls.localTransportCalls, 1, "controls.localTransportCalls");
  equal(controls.externalRequestCount, 0, "controls.externalRequestCount");
  equal(
    controls.syntheticCredentialBytes,
    520,
    "controls.syntheticCredentialBytes",
  );

  if (!/^[a-f0-9]{64}$/.test(evidence?.result?.fixtureSha256 ?? "")) {
    throw new Error("fixtureSha256 must be a SHA-256 digest");
  }
  if (!Number.isFinite(Date.parse(evidence?.generatedAt))) {
    throw new Error("generatedAt must be an ISO date");
  }

  const serialized = JSON.stringify(evidence);
  for (const pattern of [
    /gh[pousr]_[A-Za-z0-9_]{20,}/i,
    /Bearer\s+[A-Za-z0-9._-]{12,}/i,
    /(?:secret|vault):\/\/[^\s"']+/i,
  ]) {
    if (pattern.test(serialized)) {
      throw new Error(`forbidden pattern detected: ${pattern}`);
    }
  }

  return {
    valid: true,
    mode: evidence.mode,
    status: evidence.status,
    fixtureSha256: evidence.result.fixtureSha256,
  };
}

async function main() {
  const path = resolve(
    process.cwd(),
    process.argv[2] ??
      "artifacts/operator-gateway-controlled-dry-run-evidence.json",
  );
  const evidence = JSON.parse(await readFile(path, "utf8"));
  process.stdout.write(
    `${JSON.stringify(verifyControlledDryRunEvidence(evidence))}\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(
      `${JSON.stringify({
        valid: false,
        code: "controlled_dry_run_evidence_invalid",
        message: error instanceof Error ? error.message : "unknown failure",
      })}\n`,
    );
    process.exitCode = 1;
  });
}
