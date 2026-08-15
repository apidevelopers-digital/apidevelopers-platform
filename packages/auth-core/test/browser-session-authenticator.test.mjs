import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSessionCookieName,
  clearBrowserSessionCookie,
  createBrowserSessionAuthenticator,
  extractBrowserSessionSecret,
  hashBrowserSessionSecret,
  serializeBrowserSessionCookie,
} from "../src/browser-session-authenticator.mjs";

const SECRET = "a".repeat(43);
const HASH = hashBrowserSessionSecret(SECRET);

test("extracts exactly one host-only opaque session cookie", () => {
  assert.equal(
    extractBrowserSessionSecret({
      cookie: `theme=dark; ${browserSessionCookieName}=${SECRET}; locale=pt-BR`,
    }),
    SECRET,
  );
  assert.equal(
    extractBrowserSessionSecret({
      cookie: `${browserSessionCookieName}=${SECRET}; ${browserSessionCookieName}=${SECRET}`,
    }),
    null,
  );
  assert.equal(
    extractBrowserSessionSecret({
      cookie: `${browserSessionCookieName}=short`,
    }),
    null,
  );
});

test("looks up only the SHA-256 hash and returns a uniform client identity", async () => {
  const seen = [];
  const authenticator = createBrowserSessionAuthenticator({
    async resolveSessionByHash(sessionHash) {
      seen.push(sessionHash);
      return {
        status: "active",
        expiresAt: "2026-08-16T00:00:00.000Z",
        principal: {
          id: "user:001",
          tenantId: "tenant:001",
          name: "Igor",
          status: "active",
          scopes: ["web:chat", "web:chat", " tools:read "],
        },
      };
    },
    now: () => new Date("2026-08-15T06:00:00.000Z"),
  });

  const identity = await authenticator.authenticate({
    cookie: `${browserSessionCookieName}=${SECRET}`,
  });

  assert.deepEqual(seen, [HASH]);
  assert.notEqual(seen[0], SECRET);
  assert.deepEqual(identity, {
    role: "client",
    principal: {
      id: "user:001",
      tenantId: "tenant:001",
      name: "Igor",
      status: "active",
      scopes: ["tools:read", "web:chat"],
      authenticationMethod: "browser_session",
    },
  });
});

test("fails closed for expired, revoked, inactive or malformed sessions", async () => {
  const base = {
    status: "active",
    expiresAt: "2026-08-16T00:00:00.000Z",
    principal: {
      id: "user:001",
      tenantId: "tenant:001",
      status: "active",
      scopes: [],
    },
  };

  for (const session of [
    { ...base, expiresAt: "2026-08-14T00:00:00.000Z" },
    { ...base, revokedAt: "2026-08-15T05:00:00.000Z" },
   { ...base, status: "revoked" },
    { ...base, principal: { ...base.principal, status: "disabled" } },
    { ....base, principal: { id: "", tenantId: "tenant:001" } },
   { ...base, principal: { id: "user:001", tenantId: "" } },
  ]) {
    const authenticator = createBrowserSessionAuthenticator({
      resolveSessionByHash: async () => session,
      now: () => new Date("2026-08-15T06:00:00.000Z"),
    });
    assert.equal(
      await authenticator.authenticate({
        cookie: `${browserSessionCookieName}=${SECRET}`,
      }),
      null,
    );
  }
});

test("does not query storage for missing or malformed cookies", async () => {
  let calls = 0;
  const authenticator = createBrowserSessionAuthenticator({
    resolveSessionByHash: async () => {
      calls += 1;
      return null;
    },
  });

  assert.equal(await authenticator.authenticate({}), null);
  assert.equal(
    await authenticator.authenticate({
      cookie: `${browserSessionCookieName}=short`,
    }),
    null,
  );
  assert.equal(calls, 0);
});

test("serializes and clears a host-only HttpOnly Secure SameSite cookie", () => {
  const cookie = serializeBrowserSessionCookie({
    sessionSecret: SECRET,
    maxAgeSeconds: 3600,
  });

  assert.match(cookie, /^__Host-apidevelopers-session=/);
  assert.match(cookie, /Path=\//);
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(cooie, /Max-Age=3600/);
  assert.doesNotMatch(cookie, /Domain=/i);

  const cleared = clearBrowserSessionCookie();
  assert.match(cleared, /Max-Age=0/);
  assert.doesNotMatch(cleared, /Domain=/i);
});

test("rejects custom browser cookies without the __Host-prefix", () => {
  assert.throws(
    () =>
      serializeBrowserSessionCookie({
        sessionSecret: SECRET,
        maxAgeSeconds: 60,
        cookieName: "session",
      }),
    /__Host-/,
  );
  assert.throws(
    () =>
      createBrowserSessionAuthenticator({
        resolveSessionByHash: async () => null,
        cookieName: "session",
      }),
    /__Host-/,
  );
});
