import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const script = path.resolve(here, "../scripts/trust-face-pilot-control-v1.sh");

function run(dir, args, extra = {}) {
  return spawnSync("bash", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, TRUST_FACE_PILOT_STATE_DIR: dir, ...extra },
  });
}

test("kill switch defaults disabled and kill is idempotent", () => {
  const dir = mktempSync(path.join(tmpdir(), "trust-face-pilot-"));
  try {
    let r = run(dir, ["status"]);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).state, "disabled");
    r = run(dir, ["kill"]);
    assert.equal(r.status, 0);
    assert.equal(JSON.parse(r.stdout).state, "disabled");
    assert.equal(readFileSync(path.join(dir, "state"), "utf8").trim(), "disabled");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("enable fails closed without explicit confirmation", () => {
  const dir = mktempSync(path.join(tmpdir(), "trust-face-pilot-"));
  try {
    const r = run(dir, ["enable"]);
    assert.equal(r.status, 42);
    assert.equal(JSON.parse(r.stderr).error, "pilot_enable_confirmation_required");
    assert.equal(readFileSync(path.join(dir, "state"), "utf8").trim(), "disabled");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("explicit local pilot confirmation enables pilot but never production", () => {
  const dir = mktempSync(path.join(tmpdir(), "trust-face-pilot-"));
  try {
    const r = run(dir, ["enable"], { TRUST_FACE_PILOT_ENABLE_CONFIRMATION: "IGOR_APROVA_PILOTO_LOCAL" });
    assert.equal(r.status, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.state, "enabled");
    assert.equal(out.productionAuthorized, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
