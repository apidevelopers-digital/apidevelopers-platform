import test from "node:test";
import assert from "node:assert/strict";
import {
  authorizeExecution,
  normalizePath,
  sanitizePayload,
  CONFIRM_DELETE,
  CONFIRM_WRITE
} from "../src/policy.mjs";

test("read executes without confirmation", () => {
  assert.deepEqual(authorizeExecution({ method: "GET" }), {
    allowed: true,
    execute: true,
    risk: "read"
  });
});

test("write defaults to dry-run", () => {
  const result = authorizeExecution({ method: "POST" });
  assert.equal(result.allowed, true);
  assert.equal(result.execute, false);
  assert.equal(result.reason, "dry_run");
});

test("write requires exact approval", () => {
  assert.equal(authorizeExecution({
    method: "PATCH",
    dryRun: false,
    confirmacao: CONFIRM_WRITE
  }).execute, true);
});

test("delete has stronger confirmation", () => {
  assert.equal(authorizeExecution({
    method: "DELETE",
    dryRun: false,
    confirmacao: CONFIRM_WRITE
  }).allowed, false);

  assert.equal(authorizeExecution({
    method: "DELETE",
    dryRun: false,
    confirmacao: CONFIRM_DELETE
  }).execute, true);
});

test("provider paths cannot escape their API hosts", () => {
  assert.equal(normalizePath("github", "/repos/acme/repo"), "/repos/acme/repo");
  assert.equal(normalizePath("hostinger", "/api/vps/v1/virtual-machines"), "/api/vps/v1/virtual-machines");
  assert.throws(() => normalizePath("github", "https://evil.example"));
  assert.throws(() => normalizePath("hostinger", "/v1/virtual-machines"));
  assert.throws(() => normalizePath("github", "/repos/../user"));
});

test("secrets are redacted from upstream responses", () => {
  assert.deepEqual(
    sanitizePayload({ token: "abc", nested: { api_key: "def", value: 1 } }),
    { token: "[redacted]", nested: { api_key: "[redacted]", value: 1 } }
  );
});
