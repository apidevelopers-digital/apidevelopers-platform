import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";

const TENANT_ID = "tenant.preview";
const WORKSPACE_ID = "workspace.preview";
const ACCESS_GRANT_ID = "grant.preview";
const PRINCIPAL_ID = "user:preview";
const PRODUCT_ID = "product:uni-co";
const SESSION_KEY = "11111111-1111-4111-8111-111111111111";
const CHAT_SESSION_ID =
  "component.chat-session.preview.workspace-preview.11111111-1111-4111-8111-111111111111";

function boundaryWith(conversationService) {
  return createWebAgentConversationBoundary({
    authenticator: {
      async authenticate() {
        return {
          principal: {
            id: PRINCIPAL_ID,
            tenantId: TENANT_ID,
          },
        };
      },
    },
    saasRuntime: {
      async getTenant() {
        return {
          tenantId: TENANT_ID,
          slug: "preview",
          status: "active",
        };
      },
      async getWorkspace() {
        return {
          workspaceId: WORKSPACE_ID,
          tenantId: TENANT_ID,
          productId: PRODUCT_ID,
          slug: "workspace-preview",
          status: "active",
        };
      },
    },
    membershipRuntime: {
      async openChatSession() {
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
          context: {
            schemaVersion: 1,
            locale: "pt-BR",
            fallbackLocale: "en",
            direction: "ltr",
            timeZone: "America/Sao_Paulo",
            legalRegion: "BR",
            currency: "BRL",
          },
          resolution: {
            requestedLocaleSupported: true,
            localeSource: "user_preference",
          },
        };
      },
    },
    conversationService,
  });
}

const body = Object.freeze({
  accessGrantId: ACCESS_GRANT_ID,
  workspaceId: WORKSPACE_ID,
  productId: PRODUCT_ID,
  agentId: "uni.co",
  conversationId: "conversation.preview",
  sessionId: SESSION_KEY,
  requestId: "request.preview",
  correlationId: "correlation.preview",
  locale: "pt-BR",
  parts: [{ type: "text", text: "teste" }],
  capabilities: ["text"],
});

test("known shadow client errors are returned as safe public JSON", async () => {
  const error = new Error("must not be exposed");
  error.name = "WebAgentShadowClientError";
  error.code = "web_agent_shadow_upstream_rejected";
  error.status = 502;

  const boundary = boundaryWith({
    async handle() {
      throw error;
    },
  });

  const response = await boundary.handle({
    headers: { cookie: "__Host-apidevelopers-session=placeholder" },
    body,
  });

  assert.equal(response.status, 502);
  assert.deepEqual(response.payload, {
    error: "web_agent_shadow_upstream_rejected",
  });
  assert.equal(JSON.stringify(response).includes("must not be exposed"), false);
});

test("unknown cognitive service errors fail closed without exposing details", async () => {
  const boundary = boundaryWith({
    async handle() {
      throw new Error("private backend detail");
    },
  });

  const response = await boundary.handle({
    headers: { cookie: "__Host-apidevelopers-session=placeholder" },
    body,
  });

  assert.equal(response.status, 503);
  assert.deepEqual(response.payload, {
    error: "cognitive_service_unavailable",
  });
  assert.equal(JSON.stringify(response).includes("private backend detail"), false);
});
