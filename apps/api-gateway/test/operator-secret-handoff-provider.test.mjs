import test from "node:test";
import assert from "node:assert/strict";

import { createSecretHandoffService } from "../src/secret-handoff.mjs";
import { createOperatorSecretHandoffProvider } from "../src/operator-secret-handoff-provider.mjs";
import { withOperatorSecret } from "../src/operator-secret-provider-contract.mjs";

function setup() {
  const handoffService = createSecretHandoffService({
    ttlMs: 60_000,
    idFactory: () => "session-operator-001",
    tokenFactory: () => "submit-token-operator-001",
  });
  const created = handoffService.create({
    purpose: "hostinger.mysql.create",
    metadata: { database: "unijuri_staging" },
  });
  const provider = createOperatorSecretHandoffProvider({ handoffService });
  return { handoffService, created, provider };
}

test("handoff provider conforms to canonical operator secret contract", async () => {
  const { handoffService, created, provider } = setup();
  handoffService.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "temporary-db-password",
  });

  let observed;
  const result = await withOperatorSecret({
    secretProvider: provider,
    access: {
      secretRef: `secret://handoff/${created.sessionId}`,
      purpose: "hostinger.mysql.create",
      correlationId: "corr_unijuri_staging_001",
      tenantId: "uni.operator",
    },
    consumer: async (lease) => {
      observed = lease.bytes;
      assert.equal(Buffer.from(lease.bytes).toString("utf8"), "temporary-db-password");
      assert.equal(lease.version, "handoff-v1");
      return { accepted: true };
    },
  });

  assert.deepEqual(result, { accepted: true });
  assert.equal(handoffService.status(created.sessionId).state, "consumed");
  assert.equal([...observed].every((value) => value === 0), true);
});

test("purpose mismatch fails before secret consumption", async () => {
  const { handoffService, created, provider } = setup();
  handoffService.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "temporary-db-password",
  });

  await assert.rejects(
    withOperatorSecret({
      secretProvider: provider,
      access: {
        secretRef: `secret://handoff/${created.sessionId}`,
        purpose: "hostinger.mysql.delete",
      },
      consumer: async () => ({ shouldNotRun: true }),
    }),
    /secret_handoff_purpose_mismatch/,
  );

  assert.equal(handoffService.status(created.sessionId).state, "secret_received");
  assert.equal(handoffService.status(created.sessionId).secretPresent, true);
});

test("handoff secret cannot be consumed twice through provider", async () => {
  const { handoffService, created, provider } = setup();
  handoffService.submit({
    sessionId: created.sessionId,
    submitToken: created.submitToken,
    secret: "temporary-db-password",
  });

  const access = {
    secretRef: `secret://handoff/${created.sessionId}`,
    purpose: "hostinger.mysql.create",
  };

  await withOperatorSecret({
    secretProvider: provider,
    access,
    consumer: async () => ({ ok: true }),
  });

  await assert.rejects(
    withOperatorSecret({
      secretProvider: provider,
      access,
      consumer: async () => ({ shouldNotRun: true }),
    }),
    /secret_handoff_consumed/,
  );
});
