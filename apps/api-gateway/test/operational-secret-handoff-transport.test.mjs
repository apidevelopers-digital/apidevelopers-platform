import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalHttpServer } from "../src/operational-http-transport.mjs";
import { createOperatorSecretHandoffHttpApp } from "../src/operator-secret-handoff-http.mjs";
import { createSecretHandoffService } from "../src/secret-handoff.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address();
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function fixture() {
  const handoffService = createSecretHandoffService({
    ttlMs: 60_000,
    idFactory: () => "session-operational-001",
    tokenFactory: () => "submit-token-operational-001",
  });
  const created = handoffService.create({ purpose: "hostinger.mysql.create" });

  const app = {
    async handleRequest() {
      return {
        status: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not_found" }),
      };
    },
  };
  const authenticator = {
    async authenticate() {
      return {
        role: "operator",
        principal: { id: "igor", scopes: ["admin:*"] },
      };
    },
  };
  const authorization = {
    decide({ action, requiredScopes }) {
      assert.equal(action, "operator.secret-handoff.submit");
      assert.deepEqual(requiredScopes, ["admin:*"]);
      return { effect: "allow" };
    },
  };

  const secretHandoffHttpApp = createOperatorSecretHandoffHttpApp({
    app,
    authenticator,
    authorization,
    handoffService,
  });

  return { app, handoffService, created, secretHandoffHttpApp };
}

test("operational transport intercepts handoff before UTF-8 body parsing", async (t) => {
  const { app, handoffService, created, secretHandoffHttpApp } = fixture();
  const server = createOperationalHttpServer({ app, secretHandoffHttpApp });
  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/operator/secret-handoff/${created.sessionId}/submit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-secret-handoff-token": created.submitToken,
      },
      body: new Uint8Array(Buffer.from("temporary-hostinger-db-password")),
    },
   );

  assert.equal(response.status, 202);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.secretReturned, false);
  assert.equal(handoffService.status(created.sessionId).state, "secret_received");
});

test("operational transport keeps handoff disabled unless explicitly composed", async (t) => {
  let appCalls = 0;
  const app = {
    async handleRequest(request) {
      appCalls += 1;
      assert.equal(typeof request.body, "string");
      return {
        status: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not_found" }),
      };
    },
  };
  const server = createOperationalHttpServer({ app });
  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/operator/secret-handoff/session-disabled/submit`,
    {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-secret-handoff-token": "not-used",
      },
      body: new Uint8Array(Buffer.from("not-a-real-secret")),
    },
  );

  assert.equal(response.status, 404);
  assert.equal(appCalls, 1);
});
