import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertActivatable, createDomainProfileRegistry, validateDomainProfile } from "../src/index.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const profilesDir = path.join(here, "..", "profiles");

function read(name) {
  return JSON.parse(fs.readFileSync(path.join(profilesDir, name), "utf8"));
}

const imuni = read("imuni.health.v1.json");
const juri = read("unijuri.legal.v1.json");
const universo = read("universo.context.v1.json");

test("canonical draft profiles validate", () => {
  for (const profile of [imuni, juri, universo]) assert.equal(validateDomainProfile(profile), true);
});

test("health and legal remain human-reviewed high risk", () => {
  for (const profile of [imuni, juri]) {
    assert.equal(profile.riskClass, "high");
    assert.equal(profile.humanReview.required, true);
    assert.equal(profile.training.userDataAllowed, false);
  }
});

test("draft profiles cannot activate", () => {
  for (const profile of [imuni, juri, universo]) {
    assert.throws(() => assertActivatable(profile), /not active/);
  }
});

test("registry rejects duplicate profile ids", () => {
  assert.throws(() => createDomainProfileRegistry([imuni, structuredClone(imuni)]), /duplicate profileId/);
});

test("user-data training cannot be enabled silently", () => {
  const unsafe = structuredClone(imuni);
  unsafe.training.userDataAllowed = true;
  assert.throws(() => validateDomainProfile(unsafe), /user data training/);
});
