import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { createBrowserSessionHandoffService } from "../src/browser-session-handoff.mjs";

const code = "C".repeat(43);
const verifier = "v".repeat(43);
const target = "https://uni-preview.apidevelopers.digital";
const now = () => new Date("2026-09-04T10:00:00.000Z");

test("handoff carries source provenance separately from the public principal transport method", async () => {
  const sourceAuthenticator = {
    async authenticate() {
      return {
        role: "client",
        principal: {
          id: "acct_1",
          tenantId: "tenant_1",
          status: "active",
          scopes: ["web:chat"],
          authenticationMethod: "browser_session",
          sourceAuthenticationMethod: "password",
        },
      };
    },
  };

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
    headers: {},
    targetOrigin: target,
    codeChallenge,
  });

  assert.equal(stored.record.principal.authenticationMethod, "browser_session");
  assert.equal(stored.record.principal.sourceAuthenticationMethod, "password");

  const redeemed = await service.redeem({
    code,
    targetOrigin: target,
    codeVerifier: verifier,
  });

  assert.equal(redeemed.principal.authenticationMethod, "browser_session_handoff");
  assert.equal("sourceAuthenticationMethod" in redeemed.principal, false);
  assert.equal(redeemed.source.authenticationMethod, "browser_session_handoff");
  assert.equal(redeemed.source.sourceAuthenticationMethod, "password");
  assert.equal(redeemed.source.browserBindingMethod, "S256");
});

test("handoff does not fabricate provenance when the source session has none", async () => {
  const sourceAuthenticator = {
    async authenticate() {
      return {
        role: "client",
        principal: {
          id: "acct_legacy",
          tenantId: "tenant_legacy",
          status: "active",
          scopes: [],
          authenticationMethod: "browser_session",
        },
      };
    },
  };

  let record = null;
  const store = {
    async putIfAbsent(_key, value) {
      record = value;
      return true;
    },
    async take() {
      const value = record;
      record = null;
      return value;
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
  await service.issue({ targetOrigin: target, codeChallenge });
  const redeemed = await service.redeem({ code, targetOrigin: target, codeVerifier: verifier });

  assert.equal("sourceAuthenticationMethod" in redeemed.source, false);
});
