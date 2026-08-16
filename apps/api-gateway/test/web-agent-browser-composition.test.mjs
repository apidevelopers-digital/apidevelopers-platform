import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSessionCookieName,
  hashBrowserSessionSecret,
} from "@apidevelopers/auth-core/browser-session-authenticator";
import {
  createWebAgentBrowserComposition,
} from "../src/web-agent-browser-composition.mjs";

const SESSION_SECRET = "a".repeat(43);

function baseBody(overrides = {}) {
  return {
    accessGrantId: "grant:001",
    workspaceId: "workspace:001",
    productId: "product:uni-co",
    agentId: "uni.co",
    conversationId: "conv:001",
    sessionId: "session:001",
    requestId: "request:001",
    correlationId: "correlation:001",
    locale: "es-MX",
    parts: [{ type: "text", text: "Hola" }],
    capabilities: ["text", "memory"],
    ...overrides,
  };
}

function createFixture() {
  const seen = {
    sessionHashes: [],
    access: [],
    tenantProfiles: [],
    commercial: [],
    cognitive: [],
  };

  const composition = createWebAgentBrowserComposition({
    async resolveSessionByHash(sessionHash) {
      seen.sessionHashes.push(sessionHash);
      return {
        status: "active",
        expiresAt: "2026-08-16T00:00:00.000Z",
        principal: {
          id: "user:001",
          tenantId: "tenant:001",
          name: "Igor",
          status: "active",
          scopes: ["web:chat"],
        },
      };
    },
    saasAccess: {
      async evaluateAccess(context) {
        seen.access.push(context);
        return { allowed: true };
      },
    },
    tenantInternationalProfile: {
      async resolve(context) {
        seen.tenantProfiles.push(context);
        return {
          defaultLocale: "en",
          fallbackLocale: "pt-BR",
          timeZone: "America/New_York",
          legalRegion: "US",
        };
      },
    },
    commercialContext: {
      async resolve(context) {
        seen.commercial.push(context);
        return { currency: "USD" };
      },
    },
    conversationService: {
      async handle(envelope) {
        seen.cognitive.push(envelope);
        return {
          parts: [{ type: "text", text: "Hola desde uni.co" }],
          memoryRead: true,
          memoryWriteProposed: false,
          toolProposals: [],
          externalExecutionProposed: false,
        };
      },
    },
    now: () => new Date("2026-08-15T09:00:00.000Z"),
  });

  return { composition, seen };
}

test("composes browser session, SaaS access, multinational context and cognitive boundary", async () => {
  const { composition, seen } = createFixture();

  const result = await composition.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers: {
      cookie: `${browserSessionCookieName}=${SESSION_SECRET}`,
    },
    body: baseBody(),
  });

  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.agent.id, "uni.co");
  assert.equal(payload.agent.runtime, "uni-co-runtime");
  assert.equal(payload.internationalContext.locale, "es");
  assert.equal(payload.internationalContext.currency, "USD");
  assert.equal(payload.internationalContext.legalRegion, "US");
  assert.equal(payload.output.parts[0].text, "Hola desde uni.co");

  assert.deepEqual(seen.sessionHashes, [hashBrowserSessionSecret(SESSION_SECRET)]);
  assert.notEqual(seen.sessionHashes[0], SESSION_SECRET);
  assert.equal(seen.access[0].tenantId, "tenant:001");
  assert.equal(seen.access[0].workspaceId, "workspace:001");
  assert.equal(seen.tenantProfiles[0].principalId, "user:001");
  assert.equal(seen.commercial[0].accessGrantId, "grant:001");
  assert.equal(seen.cognitive[0].conversation.principalId, "user:001");
  assert.equal(seen.cognitive[0].conversation.tenantId, "tenant:001");
});

test("fails closed before entitlement and cognitive execution when the browser session is missing", async () => {
  const { composition, seen } = createFixture();

  const result = await composition.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers: {},
    body: baseBody(),
  });

  assert.equal(result.status, 401);
  assert.deepEqual(JSON.parse(result.body), { error: "unauthorized" });
  assert.equal(seen.access.length, 0);
  assert.equal(seen.tenantProfiles.length, 0);
  assert.equal(seen.commercial.length, 0);
  assert.equal(seen.cognitive.length, 0);
});

test("preserves NEXUS identity through the same browser stack", async () => {
  const { composition, seen } = createFixture();

  const result = await composition.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers: {
      cookie: `${browserSessionCookieName}=${SESSION_SECRET}`,
    },
    body: baseBody({
      productId: "product:nexus",
      agentId: "nexus",
      locale: "ar-SA",
      conversationId: "conv:nexus:001",
      requestId: "request:nexus:001",
      correlationId: "correlation:nexus:001",
      capabilities: ["text", "tools"],
    }),
  });

  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.agent.id, "nexus");
  assert.equal(payload.agent.runtime, "nexus-runtime");
  assert.equal(payload.internationalContext.direction, "rtl");
  assert.equal(seen.cognitive[0].conversation.agent.id, "nexus");
});

test("rejects incomplete composition dependencies", () => {
  assert.throws(
    () => createWebAgentBrowserComposition({}),
    /resolveSessionByHash must be a function/,
  );
});
