import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  validateOperatorGithubAppPilotManifest,
} from "../src/operator-github-app-pilot-manifest.mjs";

const manifestPath = new URL(
  "../staging/operator-github-app-pilot-manifest.example.json",
  import.meta.url,
);

async function loadManifest() {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

test("accepts the committed pre-provisioning manifest without secrets", async () => {
  const manifest = await loadManifest();
  const result = validateOperatorGithubAppPilotManifest(manifest);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.evidence.secretMaterialPresent, false);
  assert.equal(result.evidence.realActivationAuthorized, false);
  assert.equal(result.evidence.keychainItemExists, false);
});

test("rejects write permissions", async () => {
  const manifest = clone(await loadManifest());
  manifest.app.permissions.contents = "write";

  const result = validateOperatorGithubAppPilotManifest(manifest);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /contents must be read/);
});

test("rejects repositories outside the canonical allowlist", async () => {
  const manifest = clone(await loadManifest());
  manifest.installation.repositories.push("unapproved-private-repository");

  const result = validateOperatorGithubAppPilotManifest(manifest);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /must exactly match/);
});

test("rejects webhooks and event subscriptions", async () => {
  const manifest = clone(await loadManifest());
  manifest.app.webhookActive = true;
  manifest.app.events = ["push"];

  const result = validateOperatorGithubAppPilotManifest(manifest);

  assert.equal(result.ok, false);
  assert.match(result.errors.join("\n"), /webhookActive must be false/);
  assert.match(result.errors.join("\n"), /events must be empty/);
});

test("rejects premature authorization flags", async () => {
  const manifest = clone(await loadManifest());
  manifest.authorizations.configureGithubAppPilot = true;

  const result = validateOperatorGithubAppPilotManifest(manifest);

  assert.equal(result.ok, false);
  assert.match(
    result.errors.join("\n"),
    /configureGithubAppPilot must be false before approval/,
  );
});

test("rejects private key and GitHub token material", async () => {
  const privateKeyManifest = clone(await loadManifest());
  privateKeyManifest.evidence.private_key =
    "-----BEGIN PRIVATE KEY-----\nsynthetic-only\n-----END PRIVATE KEY-----";

  const privateKeyResult =
    validateOperatorGithubAppPilotManifest(privateKeyManifest);

  assert.equal(privateKeyResult.ok, false);
  assert.match(privateKeyResult.errors.join("\n"), /forbidden/);

  const tokenManifest = clone(await loadManifest());
  tokenManifest.evidence.value = "github_pat_synthetic_only";

  const tokenResult = validateOperatorGithubAppPilotManifest(tokenManifest);

  assert.equal(tokenResult.ok, false);
  assert.match(tokenResult.errors.join("\n"), /token material is forbidden/);
});
