import test from "node:test";
import assert from "node:assert/strict";

import {
  createAsyncAuthenticator,
  createAuthenticator,
} from "../src/index.mjs";

test("async authenticator resolves durable clients without changing identity shape", async () => {
  const authenticator = createAsyncAuthenticator({
    adminKey: "admin-secret",
    resolveClient: async (apiKey) => {
      if (apiKey !== "client-secret") return null;
      return {
        id: "client_001",
        name: "Client",
        status: "active",
        scopes: ["projects:read"],
      };
    },
  });

  const identity = await authenticator.authenticate({
    authorization: "Bearer client-secret",
  });

  assert.equal(identity.role, "client");
  assert.equal(identity.principal.id, "client_001");
  assert.equal(Object.isFrozen(identity), true);
  assert.equal(Object.isFrozen(identity.principal), true);
});

test("async authenticator preserves admin precedence and avoids resolver calls", async () => {
  let resolverCalls = 0;
  const authenticator = createAsyncAuthenticator({
    adminKey: "admin-secret",
    resolveClient: async () => {
      resolverCalls += 1;
      return null;
    },
  });

  const identity = await authenticator.authenticate({
    "x-api-key": "admin-secret",
  });

  assert.equal(identity.role, "admin");
  assert.equal(identity.principal.id, "platform-admin");
  assert.equal(resolverCalls, 0);
});

test("async authenticator rejects missing and unknown credentials", async () => {
  const authenticator = createAsyncAuthenticator({
    resolveClient: async () => null,
  });

  assert.equal(await authenticator.authenticate({}), null);
  assert.equal(
    await authenticator.authenticate({ authorization: "ApiKey unknown" }),
    null,
  );
});

test("legacy authenticator remains synchronous", () => {
  const authenticator = createAuthenticator({
    resolveClient: (apiKey) =>
      apiKey === "legacy-secret"
        ? { id: "legacy", status: "active", scopes: [] }
        : null,
  });

  const result = authenticator.authenticate({ "x-api-key": "legacy-secret" });

  assert.equal(typeof result?.then, "undefined");
  assert.equal(result.role, "client");
  assert.equal(result.principal.id, "legacy");
});

test("async authenticator validates resolver contract", () => {
  assert.throws(
    () => createAsyncAuthenticator({ resolveClient: null }),
    /resolveClient must be a function/,
  );
});
