import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManagedHostingArtifact } from "../scripts/build-managed-hosting-artifact.mjs";
import { applyHostingerFixedEntryCompatibility } from "../scripts/apply-hostinger-fixed-entry-compat.mjs";
import { verifyManagedHostingManifest } from "../scripts/verify-managed-hosting-artifact.mjs";

test("Hostinger fixed entry compatibility preserves the managed runtime contract", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-hostinger-fixed-entry-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const artifactDirectory = join(directory, "artifact");
  await buildManagedHostingArtifact({
    outputDirectory: artifactDirectory,
    sourceRevision: "hostinger-fixed-entry-test",
  });

  const result = await applyHostingerFixedEntryCompatibility({
    artifactDirectory,
  });

  assert.equal(result.compatibilityEntrypoint, "src/operational-server.mjs");
  assert.equal(result.runtimeModule, "src/operational-server-runtime.mjs");
  assert.equal(result.managedEntrypoint, "src/hostinger-entry.mjs");

  const shim = await readFile(
    join(artifactDirectory, "src/operational-server.mjs"),
    "utf8",
  );
  assert.equal(shim, 'import "./hostinger-entry.mjs";\n');

  const hostingerEntry = await readFile(
    join(artifactDirectory, "src/hostinger-entry.mjs"),
    "utf8",
  );
  assert.match(hostingerEntry, /\.\/operational-server-runtime\.mjs/);
  assert.doesNotMatch(hostingerEntry, /\.\/operational-server\.mjs/);

  const webAgentStartup = await readFile(
    join(artifactDirectory, "src/web-agent-operational-startup.mjs"),
    "utf8",
  );
  assert.match(webAgentStartup, /\.\/operational-server-runtime\.mjs/);
  assert.doesNotMatch(webAgentStartup, /\.\/operational-server\.mjs/);

  const runtimeModule = await readFile(
    join(artifactDirectory, "src/operational-server-runtime.mjs"),
    "utf8",
  );
  assert.match(runtimeModule, /export async function startOperationalGateway/);

  await verifyManagedHostingManifest({ artifactDirectory });
});
