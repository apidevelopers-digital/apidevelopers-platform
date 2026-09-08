import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const scripts = path.resolve(here, "../scripts");
const launcher = fs.readFileSync(
  path.join(scripts, "run-local-pilot-interface-v1.sh"),
  "utf8",
);
const executor = fs.readFileSync(
  path.join(scripts, "run-controlled-pilot-synthetic-face-pipeline-v1.py"),
  "utf8",
);

test("local synthetic launcher uses the canonical executor CLI", () => {
  assert.match(launcher, /--fixture "\$IMAGE_PATH"/);
  assert.match(launcher, /--yunet-model "\$YUNET_PATH"/);
  assert.match(launcher, /--auraface-model "\$AURAFACE_PATH"/);
  assert.match(launcher, /--output "\$RECEIPT"/);

  assert.match(executor, /add_argument\("--fixture"/);
  assert.match(executor, /add_argument\("--yunet-model"/);
  assert.match(executor, /add_argument\("--auraface-model"/);
  assert.match(executor, /add_argument\("--output"/);
});

test("local synthetic launcher parses the canonical receipt schema", () => {
  assert.match(launcher, /receipt\.get\("safety"/);
  assert.match(launcher, /receipt\.get\("detector"/);
  assert.match(launcher, /receipt\.get\("alignment"/);
  assert.match(launcher, /receipt\.get\("auraface"/);
  assert.match(launcher, /syntheticInputOnly/);
  assert.match(launcher, /detectedFaceCount/);
  assert.match(launcher, /landmarkCount/);
  assert.equal(launcher.includes("syntheticLicensedInputOnly"), false);
  assert.equal(launcher.includes('r.get("yunet"'), false);
});

test("launcher keeps execution local-only and non-authoritative", () => {
  assert.match(launcher, /GITHUB_ACTIONS/);
  assert.match(launcher, /thresholdApplied/);
  assert.match(launcher, /identityClaimed/);
  assert.match(launcher, /productionAuthorized/);
});
