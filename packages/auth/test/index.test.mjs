import test from "node:test";
import assert from "node:assert/strict";

import { createAuthEngine } from "../src/index.mjs";

const input = {
  authenticationId: "authn.0001",
  principal: {
    principalId: "principal.0001",
    type: "service_account",
    status: "active",
  },
  credential: {
    credentialId: "credential.0001",
    type: "service_credential",
    status: "active",
    issuedAt: "2026-07-19T10:00:00.000Z",
    expiresAt: "2026-07-19T12:00:00.000Z",
    revokedAt: null,
  },
  proof: "test-proof",
  scopes: ["read:status"],
  requestId: "request.auth.0001",
  correlationId: "correlation.auth.0001",
};

test("denies authentication when no verifier is configured", async () => {
  const engine = createAuthEngine({ clock: () => "2026-07-19T11:00:00.000Z" });
  await assert.rejects(engine.authenticate(input), /authentication denied/);
});

test("returns a secret-free authenticated context after explicit verification", async () => {
  let observedProof;
  const engine = createAuthEngine({
    clock: () => "2026-07-19T11:00:00.000Z",
    verifyCredential: ({ proof }) => {
      observedProof = proof;
      return proof === "test-proof";
    },
  });

  const context = await engine.authenticate(input);
  assert.equal(observedProof, "test-proof");
  assert.equal(context.authenticated, true);
  assert.equal(context.authorized, false);
  assert.equal(context.tenantId, null);
  assert.equal(context.credential.secretMaterialIncluded, false);
  assert.equal("proof" in context, false);
  assert.equal(JSON.stringify(context).includes("test-proof"), false);
  assert.ok(Object.isFrozen(context));
});

test("rejects expired or revoked credentials before verification", async () => {
  let called = 0;
  const engine = createAuthEngine({
    clock: () => "2026-07-19T13:00:00.000Z",
    verifyCredential: () => {
      called += 1;
      return true;
    },
  });

  await assert.rejects(engine.authenticate(input), /expired/);
  assert.equal(called, 0);

  const revoked = {
    ...input,
    credential: { ...input.credential, expiresAt: "2026-07-19T14:00:00.000Z", revokedAt: "2026-07-19T12:00:00.000Z" },
  };
  await assert.rejects(engine.authenticate(revoked), /revoked/);
  assert.equal(called, 0);
});
