import assert from "node:assert/strict";
import test from "node:test";

import { createHttpServer } from "../src/server.mjs";
import {
  createWebAgentConversationHttpRoute,
  webAgentConversationHttpPath,
} from "../src/web-agent-conversation-http.mjs";

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return server.address();
}

async function close(server) {
  if (!server.listening) return;
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

test("main gateway mounts the web agent route dark and fails closed by default", async (t) => {
  const server = createHttpServer();
  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agentId: "uni.co" }),
    },
  );

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), {
    error: "web_agent_conversation_unavailable",
  });
});

test("main gateway delegates a valid web request to an injected governed route", async (t) => {
  const calls = [];
  const route = createWebAgentConversationHttpRoute({
    boundary: {
      async handle(input) {
        calls.push(input);
        return {
          status: 200,
          payload: {
            requestId: "request:001",
            conversationId: "conv:001",
            agent: { id: "uni.co", runtime: "uni-co-runtime" },
            output: { parts: [{ type: "text", text: "Olá" }] },
          },
        };
      },
    },
  });

  const app = {
    async handleRequest() {
      throw new Error("legacy app must not receive web agent route");
    },
  };

  const server = createHttpServer({
    app,
    webAgentConversationRoute: route,
  });
  const address = await listen(server);
  t.after(() => close(server));

  const body = { agentId: "uni.co", parts: [{ type: "text", text: "Olá" }] };
  const response = await fetch(
    `http://127.0.0.1:${address.port}${webAgentConversationHttpPath}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json; charset=utf-8",
        "x-request-id": "request:001",
      },
      body: JSON.stringify(body),
    },
  );

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.agent.id, "uni.co");
  assert.equal(payload.agent.runtime, "uni-co-runtime");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].headers["x-request-id"], "request:001");
  assert.deepEqual(calls[0].body, body);
});

test("main gateway preserves existing non-web routes", async (t) => {
  const app = {
    async handleRequest(input) {
      return {
        status: 200,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ path: input.url }),
      };
    },
  };
  const server = createHttpServer({ app });
  const address = await listen(server);
  t.after(() => close(server));

  const response = await fetch(`http://127.0.0.1:${address.port}/existing`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { path: "/existing" });
});

test("main gateway preserves transport-safe errors for the web route", async (t) => {
  const route = createWebAgentConversationHttpRoute({
    boundary: {
      async handle() {
        throw new Error("must not run");
      },
    },
  });
  const server = createHttpServer({ webAgentConversationRoute: route });
  const address = await listen(server);
  t.after(() => close(server));

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
});
