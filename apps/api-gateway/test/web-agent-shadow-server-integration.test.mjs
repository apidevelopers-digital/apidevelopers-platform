import assert from "node:assert/strict";
import test from "node:test";

import { webAgentConversationHttpPath } from "../src/web-agent-conversation-http.mjs";
import { startServer } from "../src/server.mjs";

function route(label, status) {
  return Object.freeze({
    async readBody() {
      return {};
    },
    async handle() {
      return {
        status,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ mode: label }),
      };
    },
  });
}

function stop(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function post(server) {
  const address = server.address();
  assert.ok(address && typeof address === "object");

  return fetch(`http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
}

test("startServer keeps Web Agent dark when bootstrap resolves disabled", async (t) => {
  const darkRoute = route("dark", 503);
  const server = await startServer({
    port: 0,
    host: "127.0.0.1",
    webAgentServerBootstrapOptions: {
      env: {},
      createFallbackRoute: () => darkRoute,
      resolveShadowRuntimeConfig() {
        return { enabled: false, reason: "shadow_disabled" };
      },
    },
  });
  t.after(() => stop(server));

  const response = await post(server);
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { mode: "dark" });
});

test("startServer selects shadow route only after bootstrap enables it", async (t) => {
  const darkRoute = route("dark", 503);
  const shadowRoute = route("shadow", 200);
  const server = await startServer({
    port: 0,
    host: "127.0.0.1",
    webAgentServerBootstrapOptions: {
      env: { WEB_AGENT_SHADOW_ENABLED: "true" },
      createFallbackRoute: () => darkRoute,
      resolveShadowRuntimeConfig() {
        return {
          enabled: true,
          reason: "shadow_enabled",
          route: shadowRoute,
        };
      },
    },
  });
  t.after(() => stop(server));

  const response = await post(server);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { mode: "shadow" });
});

test("explicit Web Agent route injection bypasses bootstrap selection", async (t) => {
  const explicitRoute = route("explicit", 202);
  const server = await startServer({
    port: 0,
    host: "127.0.0.1",
    webAgentConversationRoute: explicitRoute,
    webAgentServerBootstrapOptions: {
      resolveShadowRuntimeConfig() {
        throw new Error("bootstrap must not run when route is explicit");
      },
    },
  });
  t.after(() => stop(server));

  const response = await post(server);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { mode: "explicit" });
});

test("enabled invalid bootstrap fails before opening the server", async () => {
  await assert.rejects(
    startServer({
      port: 0,
      host: "127.0.0.1",
      webAgentServerBootstrapOptions: {
        env: { WEB_AGENT_SHADOW_ENABLED: "true" },
        createFallbackRoute: () => route("dark", 503),
        resolveShadowRuntimeConfig() {
          return { enabled: true, reason: "shadow_enabled" };
        },
      },
    }),
    /shadow route must provide handle and readBody/,
  );
});
