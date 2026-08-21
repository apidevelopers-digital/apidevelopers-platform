import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";

function boundaryWith(conversationService) {
  return createWebAgentConversationBoundary({
    authenticator: {
      async authenticate() {
        return {
          principal: {
            id: "user:preview",
            tenantId: "tenant.preview",
          },
        };
      },
    },
    saasAccess: {
      async evaluateAccess() {
        return { allowed: true };
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
            timeZone: "America/Sao_Paulol",
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
  accessGrantId: "grant.preview",
  workspaceId: "workspace.preview",
  productId: "product:uni-co",
  agentId: "uni.co",
  conversationId: "conversation.preview",
  sessionId: "session.preview",
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
