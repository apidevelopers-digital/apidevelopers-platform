import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildReleaseBundle } from "../scripts/build-release-bundle.mjs";
import {
  verifyReleaseManifest,
  smokeReleaseBundle,
} from "../scripts/verify-release-bundle.mjs";

test("release bundle contains the operational runtime and institutional dependencies", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-bundle-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "bundle");
  const result = await buildReleaseBundle({
    outputDirectory,
    sourceRevision: "test-revision",
  });

  const paths = result.manifest.files.map((entry) => entry.path);
  assert.equal(result.manifest.sourceRevision, "test-revision");
  assert.ok(paths.includes("src/operational-server.mjs"));
  assert.ok(
    paths.includes(
      "node_modules/@apidevelopers/persistence-core/src/file-store.mjs",
    ),
  );
  assert.equal(paths.some((path) => path.startsWith("test/")), false);
  assert.equal(paths.some((path) => path.startsWith("staging/")), false);
  assert.equal(paths.some((path) => path.includes(".env")), false);

  await verifyReleaseManifest({ bundleDirectory: outputDirectory });
});

test("release manifest detects artifact tampering", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-bundle-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "bundle");
  await buildReleaseBundle({ outputDirectory });
  const packagePath = join(outputDirectory, "package.json");
  const packageContent = await readFile(packagePath, "utf8");
  await writeFile(packagePath, `${packageContent}\n`, "utf8");

  await assert.rejects(
    () => verifyReleaseManifest({ bundleDirectory: outputDirectory }),
    /size mismatch|checksum mismatch/,
  );
});

test("release bundle starts and passes the operational HTTP smoke", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "api-gateway-bundle-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "bundle");
  await buildReleaseBundle({ outputDirectory });

  const result = await smokeReleaseBundle({
    bundleDirectory: outputDirectory,
  });

  assert.equal(result.status, "passed");
  assert.ok(result.checks.includes("readiness"));
  assert.ok(result.checks.includes("shutdown"));
});
