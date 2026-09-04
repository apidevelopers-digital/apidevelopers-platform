import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BrowserSessionHandoffError,
  createBrowserSessionHandoffService,
} from "../src/browser-session-handoff.mjs";

function memoryStore() {
  const entries = new Map();
  return {
    entries,
    async putIfAbsent(key, value) {
      if (entries.has(key)) return false;
      entries.set(key, structuredClone(value));
      return true;
    },
    async take(key) {
      if (!entries.has(key)) return null;
      const value = entries.get(key);
      entries.delete(key);
      return structuredClone(value);
    },
  };
}

function sourceAuthenticator() {
  return {
    async authenticate(headers) {
      if (headers.cookie !== "__Host-apidevelopers-session=source-secret") return null;
      return {
        role: "client",
        principal: {
          id: "acct_123",
          tenantId: "tenant_br_123",
          name: "Cliente Demo",
          status: "active",
          scopes: ["web:chat", "campaigns:read", "web:chat"],
          authenticationMethod: "browser_session",
        },
      };
    },
  };
}

const headers = { cookie: "__Host-apidevelopers-session=source-secret" };
const verifier = "v".repeat(43);
const challenge = createHash("sha256").update(verifier, "utf8").digest("base64url");
const targetOrigin = "https://sitedauni.com";

function service({ store = memoryStore(), now, code = "A".repeat(43) } = {}) {
  return {
    store,
    handoff: createBrowserSessionHandoffService({
      sourceAuthenticator: sourceAuthenticator(),
      store,
      allowedTargetOrigins: [targetOrigin, "https://uni-preview.apidevelopers.digital"],
      ...(now ? { now } : {}),
      generateCode: () => code,
      ttlSeconds: 60,
    }),
  };
}

test("S256-bound handoff persists neither raw session secret, code nor verifier", async () => {
  const { store, handoff } = service({
    now: () => new Date("2026-09-04T03:00:00.000Z"),
  });

  const issued = await handoff.issue({ headers, targetOrigin, codeChallenge: challenge });
  assert.equal(issued.code, "A".repeat(43));
  assert.equal(handoff.descriptor.browserBindingRequired, true);
  assert.equal(handoff.descriptor.browserBindingMethod, "S256");
  assert.equal(handoff.descriptor.oneTimeRedemptionRequired, true);

  const [[key, record]] = [...store.entries];
  const serialized = JSON.stringify(record);
  assert.match(key, /^browser-session-handoff:v1:[a-f0-9]{64}$/);
  assert.equal(record.codeChallenge, challenge);
  assert.equal(serialized.includes("source-secret"), false);
  assert.equal(serialized.includes(issued.code), false);
  assert.equal(serialized.includes(verifier), false);
});

test("correct verifier redeems once and replay is rejected", async () => {
  const { handoff } = service({ code: "B".repeat(43) });
  const issued = await handoff.issue({ headers, targetOrigin, codeChallenge: challenge });

  const redeemed = await handoff.redeem({
    code: issued.code,
    targetOrigin,
    codeVerifier: verifier,
  });

  assert.equal(redeemed.authenticated, true);
  assert.equal(redeemed.principal.id, "acct_123");
  assert.equal(redeemed.principal.tenantId, "tenant_br_123");
  assert.deepEqual(redeemed.principal.scopes, ["campaigns:read", "web:chat"]);
  assert.equal(redeemed.principal.authenticationMethod, "browser_session_handoff");
  assert.equal(redeemed.source.browserBindingMethod, "S256");

  await assert.rejects(
    handoff.redeem({ code: issued.code, targetOrigin, codeVerifier: verifier }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_invalid_expired_or_redeemed" &&
      error.status === 401,
  );
});

test("wrong verifier consumes the code fail-closed", async () => {
  const { store, handoff } = service({ code: "C".repeat(43) });
  const issued = await handoff.issue({ headers, targetOrigin, codeChallenge: challenge });

  await assert.rejects(
    handoff.redeem({
      code: issued.code,
      targetOrigin,
      codeVerifier: "x".repeat(43),
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_browser_binding_mismatch" &&
      error.status === 401,
  );
  assert.equal(store.entries.size, 0);
});

test("wrong target consumes the code fail-closed", async () => {
  const { store, handoff } = service({ code: "D".repeat(43) });
  const issued = await handoff.issue({ headers, targetOrigin, codeChallenge: challenge });

  await assert.rejects(
    handoff.redeem({
      code: issued.code,
      targetOrigin: "https://uni-preview.apidevelopers.digital",
      codeVerifier: verifier,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_target_mismatch" &&
      error.status === 403,
  );
  assert.equal(store.entries.size, 0);
});

test("invalid source, challenge and target are rejected before issuance", async () => {
  const { handoff } = service();

  await assert.rejects(
    handoff.issue({ headers: {}, targetOrigin, codeChallenge: challenge }),
    (error) => error.code === "source_session_required" && error.status === 401,
  );
  await assert.rejects(
    handoff.issue({ headers, targetOrigin }),
    (error) => error.code === "handoff_code_challenge_invalid" && error.status === 400,
  );
  await assert.rejects(
    handoff.issue({
      headers,
      targetOrigin: "https://evil.example",
      codeChallenge: challenge,
    }),
    (error) => error.code === "handoff_target_not_allowed" && error.status === 403,
  );
});

test("expired handoff is consumed and rejected", async () => {
  let current = new Date("2026-09-04T03:00:00.000Z");
  const { store, handoff } = service({
    code: "E".repeat(43),
    now: () => current,
  });
  const issued = await handoff.issue({ headers, targetOrigin, codeChallenge: challenge });
  current = new Date("2026-09-04T03:01:01.000Z");

  await assert.rejects(
    handoff.redeem({ code: issued.code, targetOrigin, codeVerifier: verifier }),
    (error) => error.code === "handoff_invalid_expired_or_redeemed" && error.status === 401,
  );
  assert.equal(store.entries.size, 0);
});

test("requires atomic store and bounded TTL", () => {
  assert.throws(
    () =>
      createBrowserSessionHandoffService({
        sourceAuthenticator: sourceAuthenticator(),
        store: { putIfAbsent() {} },
        allowedTargetOrigins: [targetOrigin],
      }),
    /atomic take/,
  );

  assert.throws(
    () =>
      createBrowserSessionHandoffService({
        sourceAuthenticator: sourceAuthenticator(),
        store: memoryStore(),
        allowedTargetOrigins: [targetOrigin],
        ttlSeconds: 301,
      }),
    /between 30 and 300/,
  );
});
