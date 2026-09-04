import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  BROWSER_SESSION_HANDOFF_V1,
  BrowserSessionHandoffError,
  createBrowserSessionHandoffService,
} from "../src/browser-session-handoff.mjs";

function createAtomicMemoryStore() {
  const entries = new Map();
  return {
    entries,
    async putIfAbsent(key, record) {
      if (entries.has(key)) return false;
      entries.set(key, structuredClone(record));
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

function challenge(verifier) {
  return createHash("sha256").update(verifier, "utf8").digest("base64url");
}

const SOURCE_HEADERS = {
  cookie: "__Host-apidevelopers-session=source-secret",
};
const VERIFIER = "v".repeat(43);
const CHALLENGE = challenge(VERIFIER);

test("issues a short-lived one-time handoff with S256 browser binding without persisting raw secrets", async () => {
  const store = createAtomicMemoryStore();
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store,
    allowedTargetOrigins: ["https://sitedauni.com"],
    now: () => new Date("2026-09-04T03:00:00.000Z"),
    generateCode: () => "A".repeat(43),
    ttlSeconds: 60,
  });

  const issued = await service.issue({
    headers: SOURCE_HEADERS,
    targetOrigin: "https://sitedauni.com",
    codeChallenge: CHALLENGE,
  });

  assert.deepEqual(issued, {
    version: BROWSER_SESSION_HANDOFF_V1,
    code: "A".repeat(43),
    targetOrigin: "https://sitedauni.com",
    expiresAt: "2026-09-04T03:01:00.000Z",
  });
  assert.equal(service.descriptor.rawSourceSessionSecretPersisted, false);
  assert.equal(service.descriptor.rawHandoffCodePersisted, false);
  assert.equal(service.descriptor.oneTimeRedemptionRequired, true);
  assert.equal(service.descriptor.browserBindingRequired, true);
  assert.equal(service.descriptor.browserBindingMethod, "S256");

  assert.equal(store.entries.size, 1);
  const [[key, record]] = [...store.entries.entries()];
  assert.match(key, /^browser-session-handoff:v1:[a-f0-9]{64}$/);
  assert.equal(key.includes("A".repeat(43)), false);
  assert.equal(record.codeChallenge, CHALLENGE);
  const serialized = JSON.stringify(record);
  assert.equal(serialized.includes("source-secret"), false);
  assert.equal(serialized.includes("A".repeat(43)), false);
  assert.equal(serialized.includes(VERIFIER), false);
});

test("redeems exactly once with the correct verifier and changes the authentication method", async () => {
  const store = createAtomicMemoryStore();
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store,
    allowedTargetOrigins: ["https://sitedauni.com"],
    now: () => new Date("2026-09-04T03:00:00.000Z"),
    generateCode: () => "B".repeat(43),
    ttlSeconds: 60,
  });

  const issued = await service.issue({
    headers: SOURCE_HEADERS,
    targetOrigin: "https://sitedauni.com",
    codeChallenge: CHALLENGE,
  });

  const redeemed = await service.redeem({
    code: issued.code,
    targetOrigin: "https://sitedauni.com",
    codeVerifier: VERIFIER,
  });

  assert.equal(redeemed.authenticated, true);
  assert.equal(redeemed.principal.id, "acct_123");
  assert.equal(redeemed.principal.tenantId, "tenant_br_123");
  assert.deepEqual(redeemed.principal.scopes, ["campaigns:read", "web:chat"]);
  assert.equal(redeemed.principal.authenticationMethod, "browser_session_handoff");
  assert.equal(redeemed.source.browserBindingMethod, "S256");
  assert.equal(store.entries.size, 0);

  await assert.rejects(
    service.redeem({
      code: issued.code,
      targetOrigin: "https://sitedauni.com",
      codeVerifier: VERIFIER,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_invalid_expired_or_redeemed" &&
      error.status === 401,
  );
});

test("rejects unauthenticated source sessions", async () => {
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store: createAtomicMemoryStore(),
    allowedTargetOrigins: ["https://sitedauni.com"],
    generateCode: () => "C".repeat(43),
  });

  await assert.rejects(
    service.issue({
      headers: {},
      targetOrigin: "https://sitedauni.com",
      codeChallenge: CHALLENGE,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "source_session_required" &&
      error.status === 401,
  );
});

test("rejects missing or malformed browser binding challenges", async () => {
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store: createAtomicMemoryStore(),
    allowedTargetOrigins: ["https://sitedauni.com"],
  });

  await assert.rejects(
    service.issue({
      headers: SOURCE_HEADERS,
      targetOrigin: "https://sitedauni.com",
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_code_challenge_invalid" &&
      error.status === 400,
  );
});

test("rejects non-allowlisted and non-HTTPS targets", async () => {
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store: createAtomicMemoryStore(),
    allowedTargetOrigins: ["https://sitedauni.com"],
  });

  await assert.rejects(
    service.issue({
      headers: SOURCE_HEADEUR,
      targetOrigin: "https://evil.example",
      codeChallenge: CHALLENGE,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_target_not_allowed" &&
      error.status === 403,
  );

  await assert.rejects(
    service.issue({
      headers: SOURCE_HEADERS,
      targetOrigin: "http://sitedauni.com",
      codeChallenge: CHALLENGE,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "targetOrigin_invalid" &&
      error.status === 400,
  );
});

test("wrong target consumes the code fail-closed", async () => {
  const store = createAtomicMemoryStore();
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store,
    allowedTargetOrigins: [
      "https://sitedauni.com",
      "https://uni-preview.apidevelopers.digital",
    ],
    generateCode: () => "D".repeat(43),
  });

  const issued = await service.issue({
    headers: SOURCE_HEADERS,
    targetOrigin: "https://sitedauni.com",
    codeChallenge: CHALLENGE,
  });

  await assert.rejects(
    service.redeem({
      code: issued.code,
      targetOrigin: "https://uni-preview.apidevelopers.digital",
      codeVerifier: VERIFIER,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_target_mismatch" &&
      error.status === 403,
  );

  assert.equal(store.entries.size, 0);
});

test("wrong verifier consumes the code fail-closed", async () => {
  const store = createAtomicMemoryStore();
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store,
    allowedTargetOrigins: ["https://sitedauni.com"],
    generateCode: () => "E".repeat(43),
  });

  const issued = await service.issue({
    headers: SOURCE_HEADERS,
    targetOrigin: "https://sitedauni.com",
    codeChallenge: CHALLENGE,
  });

  await assert.rejects(
    service.redeem({
      code: issued.code,
      targetOrigin: "https://sitedauni.com",
      codeVerifier: "x".repeat(43),
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_browser_binding_mismatch" &&
      error.status === 401,
  );

  assert.equal(store.entries.size, 0);
});

test("expired codes are consumed and rejected", async () => {
  let current = new Date("2026-09-04T03:00:00.000Z");
  const store = createAtomicMemoryStore();
  const service = createBrowserSessionHandoffService({
    sourceAuthenticator: sourceAuthenticator(),
    store,
    allowedTargetOrigins: ["https://sitedauni.com"],
    now: () => current,
    generateCode: () => "F".repeat(43),
    ttlSeconds: 30,
  });

  const issued = await service.issue({
    headers: SOURCE_HEADERS,
    targetOrigin: "https://sitedauni.com",
    codeChallenge: CHALLENGE,
  });

  current = new Date("2026-09-04T03:00:31.000Z");

  await assert.rejects(
    service.redeem({
      code: issued.code,
      targetOrigin: "https://sitedauni.com",
      codeVerifier: VERIFIER,
    }),
    (error) =>
      error instanceof BrowserSessionHandoffError &&
      error.code === "handoff_invalid_expired_or_redeemed" &&
      error.status === 401,
  );

  assert.equal(store.entries.size, 0);
});

test("requires atomic store semantics and bounded TTL", () => {
  assert.throws(
    () =>
      createBrowserSessionHandoffService({
        sourceAuthenticator: sourceAuthenticator(),
        store: { putIfAbsent() {} },
        allowedTargetOrigins: ["https://sitedauni.com"],
      }),
    /atomic take/,
  );

  assert.throws(
    () =>
      createBrowserSessionHandoffService({
        sourceAuthenticator: sourceAuthenticator(),
        store: createAtomicMemoryStore(),
        allowedTargetOrigins: ["https://sitedauni.com"],
        ttlSeconds: 301,
      }),
    /between 30 and 300/,
  );
});
