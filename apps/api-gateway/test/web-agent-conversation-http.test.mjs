import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebAgentConversationHttpRoute,
  createWebAgentConversationPreviewServer,
  webAgentConversationHttpPath,
} from "../src/web-agent-conversation-http.mjs";

async function closeServer(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

function createBoundary({ status = 200, payload } = {}) {
  const calls = [];
  return {
    calls,
    boundary: {
      async handle(input) {
        calls.push(input);
        return {
          status,
          payload:
            payload ??
            {
              requestId: "request:001",
              conversationId: "conv:001",
              agent: { id: "uni.co", runtime: "uni-co-runtime" },
              output: { parts: [{ type: "text", text: "Olá" }] },
            },
        };
      },
    },
  };
}

test("dark route fails closed when no boundary is composed", async () => {
  const route = createWebAgentConversationHttpRoute();
  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    body: { parts: [{ type: "text", text: "Olá" }] },
  });

  assert.equal(result.status, 503);
  assert.deepEqual(JSON.parse(result.body), {
    error: "web_agent_conversation_unavailable",
  });
});

test("route delegates parsed JSON and headers to the governed boundary", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({
    boundary: fixture.boundary,
  });
  const body = {
    agentId: "nexus",
    locale: "ar-SA",
    parts: [{ type: "text", text: "مرحبا" }],
  };

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { "x-request-id": "request:001" },
    body,
  });

  assert.equal(result.status, 200);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.calls[0], {
    headers: { "x-request-id": "request:001" },
    body,
  });
  assert.equal(JSON.parse(result.body).agent.id, "uni.co");
});

test("route rejects malformed boundary responses without leaking internals", async () => {
  const route = createWebAgentConversationHttpRoute({
    boundary: {
      async handle() {
        return { status: 200, payload: "not-an-object", token: "private" };
      },
    },
  });

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    body: { message: "hello" },
  });

  assert.equal(result.status, 502);
  assert.deepEqual(JSON.parse(result.body), {
    error: "invalid_web_agent_boundary_response",
  });
});

test("live preview server accepts application/json and returns boundary output", async (t) => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({
    boundary: fixture.boundary,
  });
  const server = createWebAgentConversationPreviewServer({ route });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => closeServer(server));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: { "content-type": "application/json; charset=utf-8" },
      body: JSON.stringify({
        agentId: "uni.co",
        parts: [{ type: "text", text: "Olá" }],
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal((await response.json()).conversationId, "conv:001");
  assert.equal(fixture.calls.length, 1);
});

test("live preview server rejects wrong content type", async (t) => {
  const fixture = createBoundary();
  const server = createWebAgentConversationPreviewServer({
    route: createWebAgentConversationHttpRoute({
      boundary: fixture.boundary,
    }),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => closeServer(server));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    },
  );

  assert.equal(response.status, 415);
  assert.deepEqual(await response.json(), {
    error: "unsupported_media_type",
  });
  assert.equal(fixture.calls.length, 0);
});

test("live preview server rejects malformed JSON", async (t) => {
  const fixture = createBoundary();
  const server = createWebAgentConversationPreviewServer({
    route: createWebAgentConversationHttpRoute({
      boundary: fixture.boundary,
    }),
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => closeServer(server));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    },
  );

  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { error: "invalid_json" });
  assert.equal(fixture.calls.length, 0);
});

test("live preview server enforces the configured byte limit", async (t) => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({
    boundary: fixture.boundary,
    maxBodyBytes: 32,
  });
  const server = createWebAgentConversationPreviewServer({ route });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  t.after(() => closeServer(server));

  const address = server.address();
  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ payload: "x".repeat(64) }),
    },
  );

  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { error: "payload_too_large" });
  assert.equal(fixture.calls.length, 0);
});
