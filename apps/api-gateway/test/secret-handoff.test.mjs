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
  return {
    service,
    advance(ms) { now += ms; },
  };
}

test("status never exposes secret or submit token", () => {
  const { service } = fixture();
  const created = service.create({
    purpose: "hostinger.mysql.create",
    metadata: { database: "unijuri_staging" },
  });

  assert.equal(created.sessionId, "session-001");
  assert.equal(created.submitToken, "submit-token-001");

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

  assert.deepEqual(
    service.submit({
      sessionId: created.sessionId,
      submitToken: "wrong-token",
      secret: "secret",
    }),
    { ok: false, code: "secret_handoff_token_invalid" },
  );

  assert.equal(service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "first-secret",
  }).ok, true);

  assert.deepEqual(
    service.submit({
      sessionId: created.sessionId,
      submitToken: created.submitToken,
      secret: "second-secret",
    }),
    { ok: false, code: "secret_handoff_already_submitted" },
  );
});

test("secret can be consumed exactly once and consumer result may be returned", async () => {
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

  let received = null;
  const consumed = await service.consume({
    sessionId: created.sessionId,
    consumer: async (secret, context) => {
      received = { secret, context };
      return { databaseCreated: true };
    },
  });

  assert.equal(received.secret, "single-use-secret");
  assert.equal(received.context.purpose, "hostinger.mysql.create");
  assert.equal(received.context.metadata.database, "unijuri_staging");
  assert.deepEqual(consumed.result, { databaseCreated: true });
  assert.equal(service.status(created.sessionId).state, "consumed");
  assert.equal(service.status(created.sessionId).secretPresent, false);

  assert.deepEqual(
    await service.consume({
      sessionId: created.sessionId,
      consumer: async () => ({ shouldNotRun: true }),
    }),
    { ok: false, code: "secret_handoff_consumed" },
  );
});

test("expired session rejects submission and purges without exposing content", () => {
  const { service, advance } = fixture({ ttlMs: 1_000 });
  const created = service.create({ purpose: "hostinger.mysql.create" });

  advance(1_001);

  assert.equal(service.status(created.sessionId).state, "expired");
  assert.deepEqual(
    service.submit({
      sessionId: created.sessionId,
      submitToken: created.submitToken,
      secret: "late-secret",
    }),
    { ok: false, code: "secret_handoff_expired" },
  );

  assert.equal(service.purgeExpired(), 1);
  assert.deepEqual(service.status(created.sessionId), { found: false, state: "not_found" });
});

test("consumer failure still consumes and wipes the secret", async () => {
  const { service } = fixture();
  const created = service.create({ purpose: "hostinger.mysql.create" });
  service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "do-not-retry-secret",
  });

  await assert.rejects(
    service.consume({
      sessionId: created.sessionId,
      consumer: async () => {
        throw new Error("simulated_hostinger_failure");
      },
    }),
    /simulated_hostinger_failure/,
  );

  const status = service.status(created.sessionId);
  assert.equal(status.state, "consumed");
  assert.equal(status.secretPresent, false);
});
