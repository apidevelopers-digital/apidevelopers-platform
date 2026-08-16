import assert from "node:assert/strict";
import { appendFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManagedHostingArtifact } from "../scripts/build-managed-hosting-artifact.mjs";
import {
  smokeManagedHostingArtifact,
  verifyManagedHostingManifest,
} from "../scripts/verify-managed-hosting-artifact.mjs";

test("managed-hosting artifact is vendored, registry-independent and tamper-evident", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-managed-artifact-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "artifact");
  const result = await buildManagedHostingArtifact({
    outputDirectory,
    sourceRevision: "managed-artifact-test",
  });

  assert.equal(result.manifest.format, "managed-node-zip");
  assert.equal(result.manifest.sourceRevision, "managed-artifact-test");
  assert.equal(result.manifest.dependencies.length, 5);

  const packageMetadata = JSON.parse(
    await readFile(join(outputDirectory, "package.json"), "utf8"),
  );
  assert.equal(
    packageMetadata.dependencies["@apidevelopers/auth-core"],
    "file:vendor/auth-core",
  );
  assert.equal(
    packageMetadata.dependencies["@apidevelopers/persistence-core"],
    "file:vendor/persistence-core",
  );
  assert.equal(
    packageMetadata.dependencies["@apidevelopers/saas-runtime"],
    "file:vendor/saas-runtime",
  );
  assert.equal(packageMetadata.scripts.start, "node src/hostinger-entry.mjs");
  assert.equal(result.manifest.runtime.entrypoint, "src/hostinger-entry.mjs");
  const hostingerEntrypoint = await readFile(
    join(outputDirectory, "src/hostinger-entry.mjs"),
    "utf8",
  );
  assert.match(hostingerEntrypoint, /startOperationalGateway/);
  assert.match(hostingerEntrypoint, /registerOperationalShutdown/);

  const lockMetadata = JSON.parse(
    await readFile(join(outputDirectory, "package-lock.json"), "utf8"),
  );
  assert.equal(
    JSON.stringify(lockMetadata).includes("registry.npmjs.org"),
    false,
  );
  assert.equal(
    result.manifest.files.some((entry) =>
      entry.path.split("/").includes("node_modules"),
    ),
    false,
  );

  await verifyManagedHostingManifest({ artifactDirectory: outputDirectory });

  await appendFile(
    join(outputDirectory, "src/operational-server.mjs"),
    "\n// tampered\n",
    "utf8",
  );
  await assert.rejects(
    () =>
      verifyManagedHostingManifest({
        artifactDirectory: outputDirectory,
      }),
    /size mismatch|checksum mismatch/,
  );
});

test("managed-hosting artifact installs offline and passes operational smoke", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-managed-smoke-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "artifact");
  await buildManagedHostingArtifact({
    outputDirectory,
    sourceRevision: "managed-smoke-test",
  });

  const result = await smokeManagedHostingArtifact({
    artifactDirectory: outputDirectory,
  });

  assert.equal(result.status, "passed");
  assert.ok(result.checks.includes("offline_install"));
  assert.ok(result.checks.includes("readiness"));
  assert.ok(result.checks.includes("shutdown"));
});
