import test from "node:test";
import assert from "node:assert/strict";

import { createSecretHandoffService } from "../src/secret-handoff.mjs";

function fixture({ ttlMs = 60_000 } = {}) {
  let now = Date.parse("2026-09-21T22:00:00.000Z");
  const service = createSecretHandoffService({
    ttlMs,
    clock: () => now,
    idFactory: () => "session-001",
    tokenFactory: () => "submit-token-001",
  });
  return { service, advance(ms) { now += ms; } };
}

test("status never exposes secret or submit token", () => {
  const { service } = fixture();
  const created = service.create({
    purpose: "hostinger.mysql.create",
    metadata: { database: "unijuri_staging" },
  });
  const submitted = service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "example-password-never-returned",
  });
  assert.equal(submitted.ok, true);

  const status = service.status(created.sessionId);
  assert.equal(status.state, "secret_received");
  assert.equal(status.secretPresent, true);
  assert.equal("secret" in status, false);
  assert.equal("submitToken" in status, false);
  const serialized = JSON.stringify(status);
  assert.equal(serialized.includes("example-password-never-returned"), false);
  assert.equal(serialized.includes("submit-token-001"), false);
});

test("invalid token and duplicate submission fail closed", () => {
  const { service } = fixture();
  const created = service.create({ purpose: "hostinger.mysql.create" });

  assert.deepEqual(service.submit({
    sessionId: created.sessionId,
    submitToken: "wrong-token",
    secret: "secret",
  }), { ok: false, code: "secret_handoff_token_invalid" });

  assert.equal(service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "first-secret",
  }).ok, true);

  assert.deepEqual(service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "second-secret",
  }), { ok: false, code: "secret_handoff_already_submitted" });
});

test("secret is leased as bytes, consumed once, then wiped", async () => {
  const { service } = fixture();
  const created = service.create({
    purpose: "hostinger.mysql.create",
    metadata: { database: "unijuri_staging" },
  });
  service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "single-use-secret",
  });

  let leasedBytes;
  const consumed = await service.consume({
    sessionId: created.sessionId,
    consumer: async (bytes, context) => {
      assert.equal(Buffer.isBuffer(bytes), true);
      assert.equal(bytes.toString("utf8"), "single-use-secret");
      assert.equal(context.purpose, "hostinger.mysql.create");
      leasedBytes = bytes;
      return { accepted: true };
    },
  });

  assert.deepEqual(consumed.result, { accepted: true });
  assert.equal(service.status(created.sessionId).state, "consumed");
  assert.equal(service.status(created.sessionId).secretPresent, false);
  assert.equal([...leasedBytes].every((value) => value === 0), true);

  assert.deepEqual(await service.consume({
    sessionId: created.sessionId,
    consumer: async () => ({ shouldNotRun: true }),
  }), { ok: false, code: "secret_handoff_consumed" });
});

test("expiration and consumer failure destroy secret material", async () => {
  const expiring = fixture({ ttlMs: 1_000 });
  const created = expiring.service.create({ purpose: "hostinger.mysql.create" });
  expiring.advance(1_001);
  assert.equal(expiring.service.status(created.sessionId).state, "expired");
  assert.deepEqual(expiring.service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "late-secret",
  }), { ok: false, code: "secret_handoff_expired" });

  const failing = fixture();
  const created2 = failing.service.create({ purpose: "hostinger.mysql.create" });
  failing.service.submit({
    sessionId: created2.sessionId,
    submitToken: created2.submitToken,
    secret: "do-not-retry-secret",
  });
  let leasedBytes;
  await assert.rejects(failing.service.consume({
    sessionId: created2.sessionId,
    consumer: async (bytes) => {
      leasedBytes = bytes;
      throw new Error("simulated_hostinger_failure");
    },
  }), /simulated_hostinger_failure/);
  assert.equal(failing.service.status(created2.sessionId).state, "consumed");
  assert.equal([...leasedBytes].every((value) => value === 0), true);
});
