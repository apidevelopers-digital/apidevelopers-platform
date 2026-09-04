import assert from "node:assert/strict";
import test from "node:test";

import { createBrowserSessionAuthenticator } from "../src/browser-session-authenticator.mjs";

const secret = "S".repeat(43);
const now = () => new Date("2026-09-04T10:00:00.000Z");

test("browser session keeps current transport method and preserves password provenance separately", async () => {
  const authenticator = createBrowserSessionAuthenticator({
    now,
    resolveSessionByHash: async () => ({
      status: "active",
      expiresAt: "2026-09-04T11:00:00.000Z",
      principal: {
        id: "acct_1",
        tenantId: "tenant_1",
        status: "active",
        scopes: ["web:chat"],
        authenticationMethod: "password",
      },
    }),
  });

  const authenticated = await authenticator.authenticate({
    cookie: `__Host-apidevelopers-session=${secret}`,
  });

  assert.equal(authenticated.role, "client");
  assert.equal(authenticated.principal.authenticationMethod, "browser_session");
  assert.equal(authenticated.principal.sourceAuthenticationMethod, "password");
});

test("legacy browser sessions do not fabricate source provenance", async () => {
  const authenticator = createBrowserSessionAuthenticator({
    now,
    resolveSessionByHash: async () => ({
      status: "active",
      expiresAt: "2026-09-04T11:00:00.000Z",
      principal: {
        id: "acct_legacy",
        tenantId: "tenant_legacy",
        status: "active",
        scopes: [],
      },
    }),
  });

  const authenticated = await authenticator.authenticate({
    cookie: `__Host-apidevelopers-session=${secret}`,
  });

  assert.equal(authenticated.principal.authenticationMethod, "browser_session");
  assert.equal("sourceAuthenticationMethod" in authenticated.principal, false);
});
