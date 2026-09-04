import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createBrowserSessionAuthenticator } from "../src/browser-session-authenticator.mjs";
import { createBrowserSessionHandoffService } from "../src/browser-session-handoff.mjs";

const secret = "S".repeat(43);
const code = "C".repeat(43);
const verifier = "v".repeat(43);
const target = "https://uni-preview.apidevelopers.digital";
const now = () => new Date("2026-09-04T10:00:00.000Z");

test("preserves human provenance separately from browser and handoff transport methods", async () => {
  const sourceAuthenticator = createBrowserSessionAuthenticator({
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

  const sourceAuth = await sourceAuthenticator.authenticate({
    cookie: `__Host-apidevelopers-session=${secret}`,
  });
  assert.equal(sourceAuth.principal.authenticationMethod, "browser_session");
  assert.equal(sourceAuth.principal.sourceAuthenticationMethod, "password");

  let stored = null;
  const store = {
    async putIfAbsent(key, record) {
      if (stored) return false;
      stored = { key, record };
      return true;
    },
    async take(key) {
      if (!stored || stored.key !== key) return null;
      const record = stored.record;
      stored = null;
      return record;
    },
  };
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator,
    store,
    allowedTargetOrigins: [target],
    now,
    generateCode: () => code,
  });
  const codeChallenge = createHash("sha256").update(verifier).digest("base64url");
  await service.issue({
    headers: { cookie: `__Host-apidevelopers-session=${secret}` },
    targetOrigin: target,
    codeChallenge,
  });
  assert.equal(stored.record.principal.sourceAuthenticationMethod, "password");
  assert.equal(JSON.stringify(stored.record).includes(secret), false);

  const redeemed = await service.redeem({ code, targetOrigin: target, codeVerifier: verifier });
  assert.equal(redeemed.principal.authenticationMethod, "browser_session_handoff");
  assert.equal("sourceAuthenticationMethod" in redeemed.principal, false);
  assert.equal(redeemed.source.authenticationMethod, "browser_session_handoff");
  assert.equal(redeemed.source.sourceAuthenticationMethod, "password");
  assert.equal(redeemed.source.browserBindingMethod, "S256");
});
