import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";

function createFixture({ allowed = true, identityOverride = {}, rawOverride = {} } = {}) {
  const calls = [];
  const identity = {
    role: "client",
    principal: {
      id: "user:001",
      tenantId: "tenant:001",
      scopes: ["web:chat"],
      ...identityOverride.principal,
    },
    ...identityOverride,
  };

  const boundary = createWebAgentConversationBoundary({
    authenticator: {
      async authenticate(headers) {
        calls.push({ type: "auth", headers });
        return identity;
      },
    },
    saasAccess: {
      async evaluateAccess(context) {
        calls.push({ type: "access", context });
        return allowed ? { allowed: true } : { allowed: false, reason: "not_entitled" };
      },
    },
    conversationService: {
      async handle(request) {
        calls.push({ type: "conversation", request });
        return {
          parts: [{ type: "text", text: "Resposta segura" }],
          memoryRead: true,
          memoryWriteProposed: false,
          toolProposals: [],
          externalExecutionProposed: false,
          ...rawOverride,
        };
      },
    },
  });

  return { boundary, calls };
}

const baseBody = {
  accessGrantId: "grant:001",
  workspaceId: "workspace:001",
  productId: "product:uni-co",
  agentId: "uni.co",
  conversationId: "conv:001",
  sessionId: "session:001",
  requestId: "request:001",
  correlationId: "correlation:001",
  locale: "pt-BR",
  parts: [{ type: "text", text: "Olá" }],
  capabilities: ["text", "memory"],
};

test("derives principal and tenant from authentication before conversation", async () => {
  const { boundary, calls } = createFixture();
  const response = await boundary.handle({
    headers: { "authorization": "browser-session-reference" },
    body: { ...baseBody, tenantId: "tenant:forged", principalId: "user:forged" },
  });

  assert.equal(response.status, 200);
  const conversation = calls.find((call) => call.type === "conversation");
  assert.equal(conversation.request.principalId, "user:001");
  assert.equal(conversation.request.tenantId, "tenant:001");
  assert.deepEqual(conversation.request.agent, { id: "uni.co", runtime: "uni-co-runtime" });
});

test("fails closed when SaaS access is denied", async () => {
  const { boundary, calls } = createFixture({ allowed: false });
  const response = await boundary.handle({ body: baseBody });
  assert.equal(response.status, 403);
  assert.equal(response.payload.reason, "not_entitled");
  assert.equal(calls.some((call) => call.type === "conversation"), false);
});

test("rejects secret material anywhere in the raw browser body", async () => {
  const { boundary, calls } = createFixture();
  const response = await boundary.handle({
    body: { ...baseBody, meta: { apiKey: "must-not-reach-browser" } },
  });
  assert.equal(response.status, 400);
  assert.match(response.payload.message, /forbidden in a browser request/);
  assert.equal(calls.some((call) => call.type === "access"), false);
});

test("validates cognitive output and does not expose arbitrary service fields", async () => {
  const { boundary } = createFixture({
    rawOverride: { token: "leaked" },
  });
  const response = await boundary.handle({ body: baseBody });
  assert.equal(response.status, 200);
  assert.equal("token" in response.payload, false);
  assert.equal(response.payload.output.parts[0].text, "Resposta segura");
});

test("binds NEXUS to its canonical runtime through the same boundary", async () => {
  const { boundary, calls } = createFixture();
  const response = await boundary.handle({
    body: { ...baseBody, agentId: "nexus", productId: "product:nexus" },
  });
  assert.equal(response.status, 200);
  const conversation = calls.find((call) => call.type === "conversation");
  assert.deepEqual(conversation.request.agent, { id: "nexus", runtime: "nexus-runtime" });
});
