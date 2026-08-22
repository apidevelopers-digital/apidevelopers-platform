import assert from "node:assert/strict";
import test from "node:test";

import { createWebInternationalContext } from "@apidevelopers/contracts";
import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";

const TENANT_ID = "component.tenant.acme";
const WORKSPACE_ID = "component.workspace.acme.uni-main";
const ACCESS_GRANT_ID = "component.access.acme.uni-main.unico.principal-1";
const PRINCIPAL_ID = "principal-1";
const PRODUCT_ID = "product:uni-co";
const SESSION_KEY = "11111111-1111-4111-8111-111111111111";
const CHAT_SESSION_ID =
  "component.chat-session.acme.uni-main.11111111-1111-4111-8111-111111111111";

function makeHarness({
  workspaceTenantId = TENANT_ID,
  workspaceProductId = PRODUCT_ID,
  chatResult,
  chatError,
} = {}) {
  let chatCalls = 0;
  let cognitiveCalls = 0;
  let lastChatInput = null;
  let lastEnvelope = null;

  const internationalContext = createWebInternationalContext({
    locale: "pt-BR",
    fallbackLocale: "en",
    timeZone: "America/Sao_Paulo",
    currency: "BRL",
    legalRegion: "BR",
  });

  const boundary = createWebAgentConversationBoundary({
    authenticator: {
      async authenticate() {
        return {
          role: "client",
          principal: {
            id: PRINCIPAL_ID,
            tenantId: TENANT_ID,
            scopes: ["chat:use"],
          },
        };
      },
    },
    saasRuntime: {
      async getTenant(id) {
        assert.equal(id, TENANT_ID);
        return {
          tenantId: TENANT_ID,
          slug: "acme",
          status: "active",
        };
      },
      async getWorkspace(id) {
        assert.equal(id, WORKSPACE_ID);
        return {
          workspaceId: WORKSPACE_ID,
          tenantId: workspaceTenantId,
          productId: workspaceProductId,
          slug: "uni-main",
          status: "active",
        };
      },
    },
    membershipRuntime: {
      async openChatSession(input) {
        chatCalls += 1;
        lastChatInput = structuredClone(input);
        if (chatError) throw chatError;
        if (chatResult) return structuredClone(chatResult);
        return {
          opened: true,
          reason: null,
          session: {
            chatSessionId: CHAT_SESSION_ID,
            tenantId: TENANT_ID,
            workspaceId: WORKSPACE_ID,
            principalId: PRINCIPAL_ID,
            accessGrantId: ACCESS_GRANT_ID,
            productId: PRODUCT_ID,
            locale: "pt-BR",
            status: "active",
          },
        };
      },
    },
    internationalContextResolver: {
      async resolve() {
        return {
          context: internationalContext,
          resolution: {
            requestedLocaleSupported: true,
            localeSource: "user_preference",
          },
        };
      },
    },
    conversationService: {
      async handle(envelope) {
        cognitiveCalls += 1;
        lastEnvelope = structuredClone(envelope);
        return {
          parts: [{ type: "text", text: "ok" }],
          memoryRead: false,
          memoryWriteProposed: false,
          toolProposals: [],
          externalExecutionProposed: false,
        };
      },
    },
  });

  return {
    boundary,
    stats() {
      return { chatCalls, cognitiveCalls, lastChatInput, lastEnvelope };
    },
  };
}

function requestBody(overrides = {}) {
  return {
    agentId: "uni.co",
    productId: PRODUCT_ID,
    workspaceId: WORKSPACE_ID,
    accessGrantId: ACCESS_GRANT_ID,
    conversationId: "conversation-1",
    sessionId: SESSION_KEY,
    requestId: "request-1",
    correlationId: "correlation-1",
    locale: "pt-BR",
    parts: [{ type: "text", text: "oi" }],
    capabilities: ["text"],
    ...overrides,
  };
}

test("Web Agent opens governed ChatSession before cognitive forwarding", async () => {
  const harness = makeHarness();
  const response = await harness.boundary.handle({ body: requestBody() });
  const state = harness.stats();

  assert.equal(response.status, 200);
  assert.equal(state.chatCalls, 1);
  assert.equal(state.cognitiveCalls, 1);
  assert.equal(state.lastChatInput.identity.principal.id, PRINCIPAL_ID);
  assert.equal(state.lastChatInput.identity.principal.tenantId, TENANT_ID);
  assert.equal(state.lastChatInput.tenantId, TENANT_ID);
  assert.equal(state.lastChatInput.workspaceId, WORKSPACE_ID);
  assert.equal(state.lastChatInput.accessGrantId, ACCESS_GRANT_ID);
  assert.equal(state.lastChatInput.productId, PRODUCT_ID);
  assert.equal(state.lastChatInput.requiredPermission, "chat:use");
  assert.equal(state.lastChatInput.chatSessionId, CHAT_SESSION_ID);
  assert.equal(state.lastEnvelope.conversation.sessionId, CHAT_SESSION_ID);
  assert.notEqual(state.lastEnvelope.conversation.sessionId, SESSION_KEY);
});

test("Web Agent rejects cross-tenant workspace before membership or cognition", async () => {
  const harness = makeHarness({
    workspaceTenantId: "component.tenant.beta",
  });

  const response = await harness.boundary.handle({ body: requestBody() });
  const state = harness.stats();

  assert.equal(response.status, 403);
  assert.deepEqual(response.payload, {
    allowed: false,
    reason: "tenant_workspace_denied",
  });
  assert.equal(state.chatCalls, 0);
  assert.equal(state.cognitiveCalls, 0);
});

for (const scenario of [
  {
    name: "suspended or revoked membership",
    reason: "membership_not_found",
  },
  {
    name: "grant divergent from membership authority",
    reason: "membership_authority_mismatch",
  },
  {
    name: "inactive or divergent AccessGrant",
    reason: "access_denied",
  },
]) {
  test(`Web Agent fails closed for ${scenario.name}`, async () => {
    const harness = makeHarness({
      chatResult: {
        opened: false,
        reason: scenario.reason,
      },
    });

    const response = await harness.boundary.handle({ body: requestBody() });
    const state = harness.stats();

    assert.equal(response.status, 403);
    assert.deepEqual(response.payload, {
      allowed: false,
      reason: scenario.reason,
    });
    assert.equal(state.chatCalls, 1);
    assert.equal(state.cognitiveCalls, 0);
  });
}

test("Web Agent fails closed when ChatSession authority assertion throws", async () => {
  const harness = makeHarness({
    chatError: new Error("chat session tenantId authority mismatch"),
  });

  const response = await harness.boundary.handle({ body: requestBody() });
  const state = harness.stats();

  assert.equal(response.status, 403);
  assert.deepEqual(response.payload, {
    allowed: false,
    reason: "chat_session_authority_mismatch",
  });
  assert.equal(state.chatCalls, 1);
  assert.equal(state.cognitiveCalls, 0);
});

test("Web Agent rejects a ChatSession whose authoritative locale diverges", async () => {
  const harness = makeHarness({
    chatResult: {
      opened: true,
      reason: null,
      session: {
        chatSessionId: CHAT_SESSION_ID,
        tenantId: TENANT_ID,
        workspaceId: WORKSPACE_ID,
        principalId: PRINCIPAL_ID,
        accessGrantId: ACCESS_GRANT_ID,
        productId: PRODUCT_ID,
        locale: "en",
        status: "active",
      },
    },
  });

  const response = await harness.boundary.handle({ body: requestBody() });
  const state = harness.stats();

  assert.equal(response.status, 403);
  assert.deepEqual(response.payload, {
    allowed: false,
    reason: "chat_session_authority_mismatch",
  });
  assert.equal(state.cognitiveCalls, 0);
});
