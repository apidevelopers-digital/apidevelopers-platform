import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebAgentConversationHttpRoute,
  webAgentConversationHttpPath,
} from "../src/web-agent-conversation-http.mjs";
import {
  resolveWebAgentSurface,
} from "../src/web-agent-surface-policy.mjs";

function createBoundary() {
  const calls = [];
  return {
    calls,
    boundary: {
      async handle(input) {
        calls.push(input);
        return {
          status: 200,
          payload: {
            requestId: "request:surface",
            conversationId: "conversation:surface",
            agent: {
              id: input.body.agentId,
              runtime:
                input.body.agentId === "nexus" ? "nexus-runtime" : "uni-co-runtime",
            },
            output: { parts: [{ type: "text", text: "ok" }] },
          },
        };
      },
    },
  };
}

test("resolves official uni.co and NEXUS surfaces from normalized Host", () => {
  assert.deepEqual(resolveWebAgentSurface("UNICO.APIDEVELOPERS.DIGITAL:443"), {
    host: "unico.apidevelopers.digital",
    productId: "product:uni-co",
    agentId: "uni.co",
  });
  assert.deepEqual(resolveWebAgentSurface("nexus.apidevelopers.digital."), {
    host: "nexus.apidevelopers.digital",
    productId: "product:nexus",
    agentId: "nexus",
  });
});

test("derives uni.co product and agent before the governed boundary", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({ boundary: fixture.boundary });

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { host: "unico.apidevelopers.digital" },
    body: {
      accessGrantId: "grant:uni",
      workspaceId: "workspace:uni",
      parts: [{ type: "text", text: "Olá" }],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].body.productId, "product:uni-co");
  assert.equal(fixture.calls[0].body.agentId, "uni.co");
});

test("derives NEXUS product and agent before the governed boundary", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({ boundary: fixture.boundary });

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { host: "nexus.apidevelopers.digital:443" },
    body: {
      accessGrantId: "grant:nexus",
      workspaceId: "workspace:nexus",
      parts: [{ type: "text", text: "hello" }],
    },
  });

  assert.equal(result.status, 200);
  assert.equal(fixture.calls.length, 1);
  assert.equal(fixture.calls[0].body.productId, "product:nexus");
  assert.equal(fixture.calls[0].body.agentId, "nexus");
});

test("blocks cross-surface spoofing on the uni.co host before boundary", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({ boundary: fixture.boundary });

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { host: "unico.apidevelopers.digital" },
    body: {
      productId: "product:nexus",
      agentId: "nexus",
      parts: [{ type: "text", text: "spoof" }],
    },
  });

  assert.equal(result.status, 403);
  assert.deepEqual(JSON.parse(result.body), {
    error: "product_surface_agent_mismatch",
  });
  assert.equal(fixture.calls.length, 0);
});

test("blocks cross-surface spoofing on the NEXUS host before boundary", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({ boundary: fixture.boundary });

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { host: "nexus.apidevelopers.digital" },
    body: {
      productId: "product:nexus",
      agentId: "uni.co",
      parts: [{ type: "text", text: "spoof" }],
    },
  });

  assert.equal(result.status, 403);
  assert.deepEqual(JSON.parse(result.body), {
    error: "product_surface_agent_mismatch",
  });
  assert.equal(fixture.calls.length, 0);
});

test("preserves preview and local hosts until an explicit surface policy exists", async () => {
  const fixture = createBoundary();
  const route = createWebAgentConversationHttpRoute({ boundary: fixture.boundary });
  const body = {
    productId: "product:nexus",
    agentId: "nexus",
    parts: [{ type: "text", text: "preview" }],
  };

  const result = await route.handle({
    method: "POST",
    url: webAgentConversationHttpPath,
    headers: { host: "127.0.0.1:7777" },
    body,
  });

  assert.equal(result.status, 200);
  assert.equal(fixture.calls.length, 1);
  assert.deepEqual(fixture.calls[0].body, body);
});
