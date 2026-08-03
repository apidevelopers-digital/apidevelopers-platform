import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateOperatorGitHubAppPilotManifestV2,
} from "../src/operator-github-app-pilot-manifest-v2.mjs";

const manifestUrl = new URL(
  "../staging/operator-github-app-pilot-manifest-v2.example.json",
  import.meta.url,
);

async function loadManifest() {
  return JSON.parse(await readFile(manifestUrl, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("accepts the aligned read-only pilot scope", async () => {
  const result = validateOperatorGitHubAppPilotManifestV2(await loadManifest());

  assert.equal(result.ok, true);
  assert.equal(result.evidence.realActivationAuthorized, false);
  assert.equal(result.evidence.secretMaterialPresent, false);
});

test("rejects any write permission", async () => {
  const manifest = clone(await loadManifest());
  manifest.app.repositoryPermissions.contents = "write";

  const result = validateOperatorGitHubAppPilotManifestV2(manifest);

  assert.equal(result.ok, false);
});

test("rejects additional organization permissions", async () => {
  const manifest = clone(await loadManifest());
  manifest.app.organizationPermissions.members = "read";

  const result = validateOperatorGitHubAppPilotManifestV2(manifest);

  assert.equal(result.ok, false);
});

test("rejects webhooks and events", async () => {
  const manifest = clone(await loadManifest());
  manifest.app.webhookActive = true;
  manifest.app.events = ["push"];

  const result = validateOperatorGithubAppPilotManifestV2(manifest);

  assert.equal(result.ok, false);
});
