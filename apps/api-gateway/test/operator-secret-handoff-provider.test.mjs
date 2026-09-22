import test from "node:test";
import assert from "node:assert/strict";

import { createSecretHandoffService } from "../src/secret-handoff.mjs";
import { createSecretHandoffOperatorSecretProvider, createSecretHandoffRef } from "../src/operator-secret-handoff-provider.mjs";
import { withOperatorSecret } from "../src/operator-secret-provider-contract.mjs";

function fixture() {
  const service = createSecretHandoffService({
    ttlMs: 60_000,
    idFactory: () => "session-provider-001",
    tokenFactory: () => "submit-token-provider-001",
  });
  const created = service.create({ purpose: "hostinger.mysql.create" });
  return { service, created, provider: createSecretHandoffOperatorSecretProvider({ handoffService: service }) };
}

test("handoff provider satisfies canonical contract and consumes exactly once", async () => {
  const { service, created, provider } = fixture();
  const secret = Buffer.from("temporary-hostinger-password");
  assert.equal(service.submit({ sessionId: created.sessionId, submitToken: created.submitToken, secret }).ok, true);
  secret.fill(0);

  const result = await withOperatorSecret({
    secretProvider: provider,
    access: {
      secretRef: createSecretHandoffRef(created.sessionId),
      purpose: "hostinger.mysql.create",
      correlationId: "corr-provider-001",
    },
    consumer: async (lease) => {
      assert.equal(Buffer.isBuffer(lease.bytes), true);
      assert.equal(lease.bytes.toString("utf8"), "temporary-hostinger-password");
      return { ok: true, secretReturned: false };
    },
  });

  assert.deepEqual(result, { ok: true, secretReturned: false });
  assert.equal(service.status(created.sessionId).state, "consumed");
  await assert.rejects(
    () => provider.withSecret({
      secretRef: createSecretHandoffRef(created.sessionId),
      purpose: "hostinger.mysql.create",
    }, async () => ({ ok: true })),
    (error) => error?.code === "secret_consumed",
  );
});

test("purpose mismatch fails before consuming the handoff", async () => {
  const { service, created, provider } = fixture();
  service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: Buffer.from("temporary-hostinger-password"),
  });
  await assert.rejects(
    () => provider.withSecret({
      secretRef: createSecretHandoffRef(created.sessionId),
      purpose: "github.write",
    }, async () => ({ ok: true })),
    (error) => error?.code === "secret_purpose_mismatch",
  );
  assert.equal(service.status(created.sessionId).state, "secret_received");
});

test("unsupported refs and unavailable sessions fail closed without secret exposure", async () => {
  const { provider } = fixture();
  await assert.rejects(
    () => provider.withSecret({
      secretRef: "secret://vault/example",
      purpose: "hostinger.mysql.create",
    }, async () => ({ ok: true })),
    (error) => error?.code === "secret_ref_unsupported",
  );
  await assert.rejects(
    () => provider.withSecret({
      secretRef: createSecretHandoffRef("missing-session"),
      purpose: "hostinger.mysql.create",
    }, async () => ({ ok: true })),
    (error) => error?.code === "secret_unavailable" && !String(error.message).includes("password"),
  );
});

test("provider enforces canonical 8192-byte lease ceiling", async () => {
  const service = createSecretHandoffService({
    ttlMs: 60_000,
    maxSecretBytes: 16 * 1024,
    idFactory: () => "session-provider-large",
    tokenFactory: () => "submit-token-provider-large",
  });
  const created = service.create({ purpose: "hostinger.mysql.create" });
  service.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: Buffer.alloc(8193, 97),
  });
  const provider = createSecretHandoffOperatorSecretProvider({ handoffService: service });
  await assert.rejects(
    () => provider.withSecret({
      secretRef: createSecretHandoffRef(created.sessionId),
      purpose: "hostinger.mysql.create",
    }, async () => ({ ok: true })),
    (error) => error?.code === "secret_contract_violation",
  );
  assert.equal(service.status(created.sessionId).state, "consumed");
});
