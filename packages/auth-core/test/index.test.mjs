import assert from "node:assert/strict";
import test from "node:test";
import {
  authorize,
  createAuthenticator,
  extractApiKey,
} from "../src/index.mjs";

test("extracts API keys from supported headers", () => {
  assert.equal(extractApiKey({ "X-API-Key": "  direct  " }), "direct");
  assert.equal(extractApiKey({ authorization: "ApiKey delegated" }), "delegated");
  assert.equal(extractApiKey({ authorization: "Bearer bearer-key" }), "bearer-key");
  assert.equal(extractApiKey({ authorization: "Basic ignored" }), null);
});

test("authenticator resolves admin and client identities", () => {
  const authenticator = createAuthenticator({
    adminKey: "admin-secret-value",
    resolveClient: (apiKey) =>
      apiKey === "client-secret-value"
        ? { id: "client-1", scopes: ["api:read"] }
        : null,
  });

  assert.equal(
    authenticator.authenticate({ "x-api-key": "admin-secret-value" }).role,
    "admin",
  );
  assert.equal(
    authenticator.authenticate({ "x-api-key": "client-secret-value" }).principal.id,
    "client-1",
  );
  assert.equal(authenticator.authenticate({ "x-api-key": "invalid-value" }), null);
});

test("authorization evaluates roles and scopes without side effects", () => {
  const identity = {
    role: "client",
    principal: { id: "client-1", scopes: ["api:read"] },
  };

  assert.equal(authorize(identity, { roles: ["client"], scopes: ["api:read"] }).allowed, true);
  assert.deepEqual(
    authorize(identity, { roles: ["admin"], scopes: ["admin:*"] }),
    { allowed: false, reason: "role_forbidden", missingScopes: [] },
  );
  assert.deepEqual(
    authorize(identity, { scopes: ["api:write"] }),
    { allowed: false, reason: "scope_forbidden", missingScopes: ["api:write"] },
  );
});
