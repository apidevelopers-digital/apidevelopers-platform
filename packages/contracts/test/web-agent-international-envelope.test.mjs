import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebAgentConversationRequest,
} from "../src/web-agent-conversation.mjs";
import {
  createWebInternationalContext,
} from "../src/web-international-context.mjs";
import {
  assertWebAgentInternationalEnvelope,
  createWebAgentInternationalEnvelope,
} from "../src/web-agent-international-envelope.mjs";

function conversation(locale = "en") {
  return createWebAgentConversationRequest({
    agentId: "uni.co",
    conversationId: "conv:001",
    sessionId: "session:001",
    principalId: "user:001",
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    requestId: "request:001",
    correlationId: "correlation:001",
    locale,
    parts: [{ type: "text", text: "Hello" }],
    capabilities: ["text", "memory"],
    createdAt: "2026-08-15T06:00:00.000Z",
  });
}

function context(locale = "en") {
  return createWebInternationalContext({
    locale,
    fallbackLocale: "pt-BR",
    timeZone: "America/New_York",
    currency: "USD",
    legalRegion: "US",
  });
}

test("binds conversation and international context in one governed envelope", () => {
  const envelope = createWebAgentInternationalEnvelope({
    conversation: conversation("en"),
    internationalContext: context("en"),
  });

  assert.equal(envelope.schemaVersion, 1);
  assert.equal(envelope.conversation.agent.id, "uni.co");
  assert.equal(envelope.internationalContext.currency, "USD");
  assert.equal(envelope.internationalContext.legalRegion, "US");
  assertWebAgentInternationalEnvelope(envelope);
});

test("fails closed when locale differs between conversation and international context", () => {
  assert.throws(
    () =>
      createWebAgentInternationalEnvelope({
        conversation: conversation("pt-BR"),
        internationalContext: context("en"),
      }),
    /locale mismatch/,
  );
});

test("keeps NEXUS identity isolated while using the same international envelope", () => {
  const nexus = createWebAgentConversationRequest({
    agentId: "nexus",
    conversationId: "conv:nexus:001",
    sessionId: "session:nexus:001",
    principalId: "user:001",
    tenantId: "tenant:001",
    workspaceId: "workspace:001",
    requestId: "request:nexus:001",
    correlationId: "correlation:nexus:001",
    locale: "ar",
    parts: [{ type: "text", text: "مرحبا" }],
    capabilities: ["text", "tools"],
    createdAt: "2026-08-15T06:00:00.000Z",
  });
  const intl = createWebInternationalContext({
    locale: "ar",
    fallbackLocale: "en",
    timeZone: "Asia/Riyadh",
    currency: "SAR",
    legalRegion: "SA",
  });

  const envelope = createWebAgentInternationalEnvelope({
    conversation: nexus,
    internationalContext: intl,
  });

  assert.equal(envelope.conversation.agent.runtime, "nexus-runtime");
  assert.equal(envelope.internationalContext.direction, "rtl");
});
