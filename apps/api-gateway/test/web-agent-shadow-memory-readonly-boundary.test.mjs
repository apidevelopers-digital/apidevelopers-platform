import assert from "node:assert/strict";
import test from "node:test";

import { createWebInternationalContext } from "@apidevelopers/contracts";
import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";
import { createWebAgentShadowMemoryReadOnlyConversationService } from "../src/web-agent-shadow-memory-readonly-service.mjs";

const body = {
  accessGrantId: "grant:001",
  workspaceId: "workspace:uni",
  productId: "product:uni-co",
  agentId: "uni.co",
  conversationId: "conv:001",
  sessionId: "session:001",
  requestId: "request:001",
  correlationId: "correlation:001",
  locale: "pt-BR",
  parts: [{ type: "text", text: "Olá" }],
  capabilities: ["text", "memory"],
  customerRef: "browser-forged",
};

function international() {
  return createWebInternationalContext({
    locale: "pt-BR",
    fallbackLocale: "en",
    timeZone: "America/Sao_Paulo",
    currency: "BRL",
    legalRegion: "BR",
  });
}

test("read-only memory uses authenticated principal and minimizes cognitive context", async () => {
  const recalls = [];
  const downstream = [];

  const conversationService = createWebAgentShadowMemoryReadOnlyConversationService({
    memoryProvider: {
      async recall(input) {
        recalls.push(input);
        return {
          agentId: "uni.co",
          tenantId: "tenant:server",
          workspaceId: "workspace:uni",
          contactKey: "contact-key",
          data: {
            summary: "Prefere português",
            openLoops: ["conferir oferta"],
            nextBestAction: "retomar contato",
            topics: ["saas", "onboarding"],
            secret: "never-forward",
          },
        };
      },
    },
    conversationService: {
      async handle(envelope) {
        downstream.push(envelope);
        return {
          parts: [{ type: "text", text: "ok" }],
          memoryRead: true,
          memoryWriteProposed: false,
          toolProposals: [],
          externalExecutionProposed: false,
        };
      },
    },
  });

  const boundary = createWebAgentConversationBoundary({
    authenticator: {
      async authenticate() {
        return {
          role: "client",
          principal: {
            id: "user:server-auth",
            tenantId: "tenant:server",
            scopes: ["web:chat"],
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
          context: international(),
          resolution: {
            requestedLocaleSupported: true,
            localeSource: "user_preference",
          },
        };
      },
    },
    conversationService,
  });

  const response = await boundary.handle({ headers: {}, body });
  assert.equal(response.status, 200);
  assert.deepEqual(recalls, [{
    agentId: "uni.co",
    tenantId: "tenant:server",
    workspaceId: "workspace:uni",
    customerRef: "user:server-auth",
  }]);

  const memoryContext = downstream[0].memoryContext;
  assert.equal(memoryContext.mode, "read_only");
  assert.deepEqual(memoryContext.data, {
    summary: "Prefere português",
    nextBestAction: "retomar contato",
    openLoops: ["conferir oferta"],
    topics: ["saas", "onboarding"],
  });
  assert.equal("secret" in memoryContext.data, false);
  assert.equal("customerRef" in downstream[0].conversation, false);
});

test("missing memory preserves original envelope and proposes no write", async () => {
  let seen;
  const service = createWebAgentShadowMemoryReadOnlyConversationService({
    memoryProvider: { async recall() { return null; } },
    conversationService: {
      async handle(envelope) {
        seen = envelope;
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

  const envelope = {
    conversation: {
      agent: { id: "nexus" },
      tenantId: "tenant:nexus",
      workspaceId: "workspace:nexus",
      principalId: "user:nexus",
    },
  };
  const result = await service.handle(envelope);
  assert.equal(seen, envelope);
  assert.equal(result.memoryWriteProposed, false);
});
