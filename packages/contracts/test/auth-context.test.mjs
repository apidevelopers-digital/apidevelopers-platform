import test from "node:test";
import assert from "node:assert/strict";

import {
  assertAuthContextContract,
  createAuthContext,
} from "../src/auth-context.mjs";

test("creates an immutable secret-free auth context", () => {
  const context = createAuthContext({
    authenticationId: "authn.0001",
    principal: { principalId: "principal.0001", type: "api_key", status: "active" },
    credential: {
      credentialId: "credential.0001",
      type: "api_key",
      status: "active",
      issuedAt: "2026-07-19T10:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    },
    scopes: ["read:status"],
    requestId: "request.auth.0001",
    correlationId: "correlation.auth.0001",
    authenticatedAt: "2026-07-19T11:00:00.000Z",
  });

  assert.equal(assertAuthContextContract(context), context);
  assert.equal(context.authorized, false);
  assert.equal(context.tenantId, null);
  assert.equal(context.credential.secretMaterialIncluded, false);
  assert.ok(Object.isFrozen(context));
});

test("rejects identities, secrets or implicit authorization in the context", () => {
  const base = createAuthContext({
    authenticationId: "authn.0002",
    principal: { principalId: "principal.0002", type: "user", status: "active" },
    credential: {
      credentialId: "credential.0002",
      type: "session",
      status: "active",
      issuedAt: "2026-07-19T10:00:00.000Z",
      expiresAt: "2026-07-19T12:00:00.000Z",
    },
    requestId: "request.auth.0002",
    correlationId: "correlation.auth.0002",
    authenticatedAt: "2026-07-19T11:00:00.000Z",
  });

  assert.throws(() => assertAuthContextContract({
    ...base,
    principal: { ...base.principal, principalId: "person@example.com" },
  }), /safe identifier|email address/);

  assert.throws(() => assertAuthContextContract({
    ...base,
    credential: { ...base.credential, secretMaterialIncluded: true },
  }), /secretMaterialIncluded must be false/);

  assert.throws(() => assertAuthContextContract({ ...base, authorized: true }), /authorized must be false/);
});
