import assert from "node:assert/strict";
import test from "node:test";

import {
  createWebInternationalContext,
} from "@apidevelopers/contracts";
import {
  createWebAgentConversationBoundary,
} from "../src/web-agent-conversation-boundary.mjs";

function createFixture({
  allowed = true,
  identityOverride = {},
  rawOverride = {},
  internationalOverride = {},
} = {}) {
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

  const internationalContext = createWebInternationalContext({
    locale: "en",
    fallbackLocale: "pt-BR",
    timeZone: "America/New_York",
    currency: "USD",
    legalRegion: "US",
    ...internationalOverride.context,
  });

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
        return allowed
          ? { allowed: true }
          : { allowed: false, reason: "not_entitled" };
      },
    },
    internationalContextResolver: {
      async resolve(context) {
        calls.push({ type: "international", context });
        return {
          context: internationalContext,
          resolution: {
            requestedLocaleSupported: true,
            localeSource: "user_preference",
            ...internationalOverride.resolution,
          },
        };
      },
    },
    conversationService: {
      async handle(envelope) {
        calls.push({ type: "conversation", envelope });
        return {
          parts: [{ type: "text", text: "Safe response" }],
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
  locale: "en-US",
  parts: [{ type: "text", text: "Hello" }],
  capabilities: ["text", "memory"],
};

test("derives principal and tenant from auth and sends a governed international envelope", async () => {
  const { boundary, calls } = createFixture();
  const response = await boundary.handle({
    headers: { authorization: "browser-session-reference" },
    body: {
      ...baseBody,
      tenantId: "tenant:forged",
      principalId: "user:forged",
      currency: "JPY",
      legalRegion: "JP",
      timeZone: "Asia/Tokyo",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.payload.internationalContext.currency, "USD");
  assert.equal(response.payload.internationalContext.legalRegion, "US");
  assert.equal(response.payload.internationalContext.timeZone, "America/New_York");

  const conversation = calls.find((call) => call.type === "conversation");
  assert.equal(conversation.envelope.conversation.principalId, "user:001");
  assert.equal(conversation.envelope.conversation.tenantId, "tenant:001");
  assert.equal(conversation.envelope.conversation.locale, "en");
  assert.equal(conversation.envelope.internationalContext.currency, "USD");

  const international = calls.find((call) => call.type === "international");
  assert.equal(international.context.requestedLocale, "en-US");
  assert.equal(international.context.tenantId, undefined);
  assert.equal(international.context.identity.principal.tenantId, "tenant:001");
});

test("fails closed before international resolution when SaaS access is denied", async () => {
  const { boundary, calls } = createFixture({ allowed: false });
  const response = await boundary.handle({ body: baseBody });

  assert.equal(response.status, 403);
  assert.equal(response.payload.reason, "not_entitled");
  assert.equal(
    calls.some((call) => call.type === "international"),
    false,
  );
  assert.equal(
    calls.some((call) => call.type === "conversation"),
    false,
  );
});

test("rejects secret material anywhere in the raw browser body", async () => {
  const { boundary, calls } = createFixture();
  const response = await boundary.handle({
    body: {
      ...baseBody,
      meta: { apiKey: "must-not-reach-browser" },
    },
  });

  assert.equal(response.status, 400);
  assert.match(response.payload.message, /forbidden in a browser request/);
  assert.equal(calls.some((call) => call.type === "access"), false);
});

test("fails closed when authoritative international context is unavailable", async () => {
  const boundary = createWebAgentConversationBoundary({
    authenticator: {
      async authenticate() {
        return {
          principal: { id: "user:001", tenantId: "tenant:001" },
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
        throw new Error("commercial context unavailable");
      },
    },
    conversationService: {
      async handle() {
        throw new Error("must not run");
      },
    },
  });

  const response = await boundary.handle({ body: baseBody });
  assert.equal(response.status, 503);
  assert.equal(response.payload.error, "international_context_unavailable");
});

test("validates cognitive output and does not expose arbitrary service fields", async () => {
  const { boundary } = createFixture({
    rawOverride: { token: "leaked", internalTrace: "private" },
  });

  const response = await boundary.handle({ body: baseBody });
  assert.equal(response.status, 200);
  assert.equal("token" in response.payload, false);
  assert.equal("internalTrace" in response.payload, false);
  assert.equal(response.payload.output.parts[0].text, "Safe response");
});

test("binds NEXUS to nexus-runtime through the same multinational boundary", async () => {
  const { boundary, calls } = createFixture({
    internationalOverride: {
      context: {
        locale: "ar",
        fallbackLocale: "en",
        timeZone: "Asia/Riyadh",
        currency: "SAR",
        legalRegion: "SA",
      },
    },
  });

  const response = await boundary.handle({
    body: {
      ...baseBody,
      agentId: "nexus",
      productId: "product:nexus",
      locale: "ar-SA",
    },
  });

  assert.equal(response.status, 200);
  const conversation = calls.find((call) => call.type === "conversation");
  assert.deepEqual(conversation.envelope.conversation.agent, {
    id: "nexus",
    runtime: "nexus-runtime",
  });
  assert.equal(response.payload.internationalContext.direction, "rtl");
});
