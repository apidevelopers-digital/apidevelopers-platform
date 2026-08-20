import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSameWebAgentBoundary,
  assertWebAgentConversationRequest,
  createWebAgentConversationRequest,
  createWebAgentConversationResponse,
} from "../src/web-agent-conversation.mjs";

const base = {
  agentId: "uni.co",
  conversationId: "conv:001",
  sessionId: "session:001",
  principalId: "user:001",
  tenantId: "tenant:001",
  workspaceId: "workspace:001",
  requestId: "request:001",
  correlationId: "correlation:001",
  parts: [{ type: "text", text: "Olá" }],
  capabilities: ["text", "memory", "tools"],
  createdAt: "2026-08-15T06:00:00.000Z",
};

test("creates a browser-safe uni.co request with canonical runtime binding", () => {
  const request = createWebAgentConversationRequest(base);
  assert.equal(request.channel, "web");
  assert.deepEqual(request.agent, { id: "uni.co", runtime: "uni-co-runtime" });
  assert.equal(request.policy.secretsExposed, false);
  assert.equal(request.policy.crossTenantAccessAllowed, false);
  assert.equal(request.policy.automaticExternalExecutionAllowed, false);
});

test("binds NEXUS to nexus-runtime and never uni.co runtime", () => {
  const request = createWebAgentConversationRequest({ ...base, agentId: "nexus" });
  assert.deepEqual(request.agent, { id: "nexus", runtime: "nexus-runtime" });

  const forged = structuredClone(request);
  forged.agent.runtime = "uni-co-runtime";
  assert.throws(() => assertWebAgentConversationRequest(forged), /nexus must bind to nexus-runtime/);
});

test("fails closed on cross-tenant or cross-agent conversation reuse", () => {
  const left = createWebAgentConversationRequest(base);
  const otherTenant = createWebAgentConversationRequest({
    ...base,
    tenantId: "tenant:002",
    requestId: "request:002",
  });
  const otherAgent = createWebAgentConversationRequest({
    ...base,
    agentId: "nexus",
    requestId: "request:003",
  });

  assert.throws(() => assertSameWebAgentBoundary(left, otherTenant), /tenantId/);
  assert.throws(() => assertSameWebAgentBoundary(left, otherAgent), /agent identity/);
});

test("rejects secret material in any browser request field", () => {
  const request = structuredClone(createWebAgentConversationRequest(base));
  request.apiKey = "must-never-reach-browser";
  assert.throws(() => assertWebAgentConversationRequest(request), /forbidden in the browser contract/);

  const nested = structuredClone(createWebAgentConversationRequest(base));
  nested.input.secretToken = "no";
  assert.throws(() => assertWebAgentConversationRequest(nested), /forbidden in the browser contract/);
});

test("accepts multimodal asset references without embedding credentials", () => {
  const request = createWebAgentConversationRequest({
    ...base,
    capabilities: ["text", "image", "audio", "video", "vision"],
    parts: [
      { type: "text", text: "Analise estes materiais" },
      { type: "image", assetId: "asset:image:001", mimeType: "image/jpeg" },
      { type: "audio", assetId: "asset:audio:001", mimeType: "audio/ogg" },
      { type: "video", assetId: "asset:video:001", mimeType: "video/mp4" },
    ],
  });
  assert.equal(request.input.parts.length, 4);
});

test("response separates proposals from executed actions", () => {
  const response = createWebAgentConversationResponse({
    requestId: base.requestId,
    correlationId: base.correlationId,
    conversationId: base.conversationId,
    agentId: "uni.co",
    runtime: "uni-co-runtime",
    parts: [{ type: "text", text: "Posso preparar a ação para aprovação." }],
    memoryRead: true,
    memoryWriteProposed: true,
    toolProposals: [{ tool: "calendar.create", reason: "requested by user" }],
    externalExecutionProposed: true,
    createdAt: "2026-08-15T06:00:01.000Z",
  });

  assert.equal(response.memory.writeExecuted, false);
  assert.deepEqual(response.tools.executed, []);
  assert.equal(response.externalExecution.executed, false);
  assert.equal(response.externalExecution.humanApprovalRequired, true);
});
