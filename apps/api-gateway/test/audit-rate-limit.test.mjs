import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createJsonlAuditLog,
  createMemoryAuditLog,
} from "../src/audit-log.mjs";
import { createFixedWindowRateLimiter } from "../src/rate-limit.mjs";

test("audit log redacts sensitive fields", () => {
  const audit = createMemoryAuditLog({
    clock: () => "2026-07-19T12:00:00.000Z",
    idFactory: () => "audit-1",
  });

  audit.append({
    action: "client.create",
    actor: { type: "admin", id: "admin", authorization: "secret" },
    metadata: {
      apiKey: "apid_should_not_leak",
      nested: { password: "also-secret", keyId: "safe-key-id" },
    },
  });

  const [entry] = audit.list();
  assert.equal(entry.actor.authorization, "[REDACTED]");
  assert.equal(entry.metadata.apiKey, "[REDACTED]");
  assert.equal(entry.metadata.nested.password, "[REDACTED]");
  assert.equal(entry.metadata.nested.keyId, "safe-key-id");
});

test("JSONL audit log persists append-only entries", () => {
  const directory = mkdtempSync(join(tmpdir(), "api-audit-"));
  const filePath = join(directory, "audit.jsonl");

  try {
    const audit = createJsonlAuditLog({
      filePath,
      clock: () => "2026-07-19T12:00:00.000Z",
      idFactory: () => "audit-1",
    });
    audit.append({ action: "client.create" });
    audit.append({ action: "api_key.rotate" });

    const lines = readFileSync(filePath, "utf8")
      .trim()
      .split("\n");
    assert.equal(lines.length, 2);
    assert.deepEqual(
      audit.list().map((entry) => entry.action),
      ["api_key.rotate", "client.create"],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("fixed-window rate limiter resets after the window", () => {
  let now = 1_000;
  const limiter = createFixedWindowRateLimiter({
    limit: 2,
    windowMs: 1_000,
    clock: () => now,
  });

  assert.equal(limiter.consume("client").allowed, true);
  assert.equal(limiter.consume("client").allowed, true);
  assert.equal(limiter.consume("client").allowed, false);

  now = 2_000;
  const reset = limiter.consume("client");
  assert.equal(reset.allowed, true);
  assert.equal(reset.remaining, 1);
});
