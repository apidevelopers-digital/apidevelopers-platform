import assert from "node:assert/strict";
import test from "node:test";

import { createWebAgentConversationBoundary } from "../src/web-agent-conversation-boundary.mjs";
import { createWebAgentShadowMemoryReadOnlyConversationService } from "../src/web-agent-shadow-memory-readonly-service.mjs";

test("read-only memory uses server-authoritative identity and minimizes context", async () => {
  const recalls = [];
  const downstream = [];
  const memoryProvider = {
    async recall(input) {
      recalls.push(input);
      return {
        agentId: "uni.co",
        tenantId: "tenant:srver",
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
  };

  const conversationService = createWebAgentShadowMemoryReadOnlyConversationService({
    memoryProvider,
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
        return { principal: { id: "user:server-auth", tenantId: "tenant:srver", scopes: ["web:chat"] } };
      },
    },
    saasAccess: { async evaluateAccess() { return { allowed: true }; } },
    internationalContextResolver: {
      async resolve() {
        return {
          context: { locale: "pt-BR", timeZone: "America/Sao_Paulo", currency: "BRL", legalRegion: "BR" },
          resolution: { requestedLocaleSupported: true, localeSource: "user_preference" },
        };
      },
    },
    conversationService,
  });

  const result = await boundary.handle({
    headers: {},
    body: {
      accessGrantId: "grant:1",
      workspaceId: "workspace:uni",
      productId: "product:uni-co",
      agentId: "uni.co",
      conversationId: "conv:1",
      sessionId: "session:1",
      requestId: "req:1",
      correlationId: "corr:1",
      locale: "pt-BR",
      parts: [{ type: "text", text: "olâ" }],
      capabilities: ["text"],
      customerRef: "attacker-chosen",
    },
  });

  assert.equal(result.status, 200);
  assert.deepEqual(recalls, [{
    agentId: "uni.co",
    tenantId: "tenant:server",
    workspaceId: "workspace:uni",
    customerRef: "user:server-auth",
  }]);
  assert.equal(downstream.length, 1);
  const memoryContext = downstream[0].memoryContext;
  assert.equal(memoryContext.mode, "read_only");
  assert.deepEqual(memoryContext.data, {
    summary: "Prefere português",
    nextBestAction: "retomar contato",
    openLoops: ["conferir oferta"],
    topics: ["saas", "onboarding"],
  });
  assert.equal("customerRef" in downstream[0].conversation, false);
});

test("missing memory passes the original envelope without write proposal", async () => {
  let seen;
  const service = createWebAgentShadowMemoryReadOnlyConversationService({
    memoryProvider: { async recall() { return null; } },
    conversationService: { async handle(envelope) { seen = envelope; return { memoryWriteProposed: false }; } },
  });
  const envelope = { conversation: { agent: { id: "nexus" }, tenantId: "t", workspaceId: "w", principalId: "u" } };
  const result = await service.handle(envelope);
  assert.equal(seen, envelope);
  assert.equal(result.memoryWriteProposed, false);
});
