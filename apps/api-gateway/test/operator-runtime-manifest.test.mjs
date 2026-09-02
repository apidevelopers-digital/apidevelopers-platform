import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManagedHostingArtifact } from "../scripts/build-managed-hosting-artifact.mjs";

test("managed-hosting manifest declares operator runtime configuration", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-operator-manifest-test-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const outputDirectory = join(directory, "artifact");
  const result = await buildManagedHostingArtifact({
    outputDirectory,
    sourceRevision: "operator-manifest-test",
  });

  assert.deepEqual(result.manifest.configuration.required, [
    "API_GATEWAY_STATE_FILE",
  ]);
  assert.deepEqual(result.manifest.configuration.optional, [
    "API_GATEWAY_ADMIN_KEY",
    "API_GATEWAY_OPERATOR_KEY",
    "API_GATEWAY_OPERATOR_TENANT_ID",
    "HOST",
    "PORT",
  ]);
});
