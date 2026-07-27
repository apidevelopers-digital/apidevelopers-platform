import assert from "node:assert/strict";
import test from "node:test";

import { createApp } from "../src/server.mjs";

test("health remains public and does not invoke authentication", async () => {
  let calls = 0;
  const app = createApp({
    authenticator: {
      async authenticate() {
        calls += 1;
        return null;
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/health",
    headers: { "x-api-key": "ignored" },
  });

  assert.equal(response.status, 200);
  assert.equal(calls, 0);
});

test("whoami reports unavailable authentication when composition is absent", async () => {
  const response = await createApp().handleRequest({
    method: "GET",
    url: "/v1/whoami",
  });

  assert.equal(response.status, 503);
  assert.deepEqual(JSON.parse(response.body), {
    error: "authentication_unavailable",
  });
});

test("whoami rejects missing or invalid credentials", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return null;
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {},
  });

  assert.equal(response.status, 401);
  assert.deepEqual(JSON.parse(response.body), {
    error: "unauthorized",
  });
});

test("whoami returns only the public identity contract", async () => {
  const app = createApp({
    authenticator: {
      async authenticate() {
        return {
          role: "client",
          principal: {
            id: "key_001",
            tenantId: "tenant_001",
            name: "Primary",
            status: "active",
            scopes: ["projects:read"],
            prefix: "apid_public",
            secret: "must-not-leak",
            hash: "must-not-leak",
            keyHash: "must-not-leak",
          },
        };
      },
    },
  });

  const response = await app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": "apid_public_secret",
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), {
    identity: {
      role: "client",
      principal: {
        id: "key_001",
        tenantId: "tenant_001",
        name: "Primary",
        status: "active",
        scopes: ["projects:read"],
        prefix: "apid_public",
      },
    },
    tenantContext: {
      contractType: "TenantContext",
      schemaVersion: "1.0.0",
      tenantId: "tenant_001",
      region: "global",
      isolationMode: "strict",
      crossTenantAccessAllowed: false,
      scopes: ["projects:read"],
    },
  });
  assert.equal(response.body.includes("must-not-leak"), false);
  assert.equal(response.body.includes("keyHash"), false);
});

test("createApp validates the authenticator contract", () => {
  assert.throws(
    () => createApp({ authenticator: {} }),
    /authenticator\.authenticate must be a function/,
  );
});
