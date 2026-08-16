import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSessionCookieName,
  hashBrowserSessionSecret,
} from "@apidevelopers/auth-core/browser-session-authenticator";
import { createWebAgentShadowBrowserComposition } from "../src/web-agent-shadow-browser-composition.mjs";

const SESSION = "a".repeat(43);
const TECHNICAL_KEY = "fixture-key";

function buildComposition(seen) {
  return createWebAgentShadowBrowserComposition({
    async resolveSessionByHash(hash) {
      assert.equal(hash, hashBrowserSessionSecret(SESSION));
      return {
        status: "active",
        expiresAt: "2026-08-16T00:00:00.000Z",
        principal: {
          id: "user:001",
          tenantId: "tenant:001",
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
      async resolve() {
        return {
          defaultLocale: "es-MX",
          fallbackLocale: "pt-BR",
          timeZone: "America/Mexico_City",
          legalRegion: "MX",
        };
      },
    },
    commercialContext: {
      async resolve() {
        return { currency: "MXN" };
      },
    },
    now: () => new Date("2026-08-15T10:00:00.000Z"),
    shadowRuntime: {
      baseUrl: "https://runtime.example/",
      apiKey: TECHNICAL_KEY,
      async fetchImpl(url, options) {
        seen.upstream.push({ url, options });
        return {
          ok: true,
          status: 200,
          async json() {
            return {
              ok: true,
              result: {
                agentId: "uni.co",
                runtime: "uni-co-runtime",
                executed: false,
                sendAllowed: false,
                parts: [{ type: "text", text: "Hola desde uni.co" }],
                memoryRead: false,
                memoryWriteProposed: false,
                toolProposals: [],
                externalExecutionProposed: false,
              },
            };
          },
        };
      },
    },
  });
}

test("browser session reaches uni.co shadow only after entitlement and international context", async () => {
  const seen = { access: [], upstream: [] };
  const composition = buildComposition(seen);

  const result = await composition.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers: {
      cookie: `${browserSessionCookieName}=${SESSION}`,
    },
    body: {
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
      capabilities: ["text"],
    },
  });

  assert.equal(result.status, 200);
  const payload = JSON.parse(result.body);
  assert.equal(payload.output.parts[0].text, "Hola desde uni.co");
  assert.equal(payload.agent.id, "uni.co");
  assert.equal(payload.agent.runtime, "uni-co-runtime");
  assert.equal(payload.internationalContext.locale, "es");
  assert.equal(payload.internationalContext.currency, "MXN");
  assert.equal(payload.internationalContext.legalRegion, "MX");
  assert.equal(payload.internationalContext.timeZone, "America/Mexico_City");

  assert.equal(seen.access.length, 1);
  assert.equal(seen.access[0].productId, "product:uni-co");
  assert.equal(seen.access[0].tenantId, "tenant:001");

  assert.equal(seen.upstream.length, 1);
  const call = seen.upstream[0];
  assert.equal(call.options.headers["x-unico-api-key"], TECHNICAL_KEY);
  assert.equal(call.options.headers["x-tenant-id"], "tenant:001");

  const upstreamBody = JSON.parse(call.options.body);
  assert.equal(upstreamBody.agentId, "uni.co");
  assert.equal(upstreamBody.tenantId, "tenant:001");
  assert.equal(upstreamBody.workspaceId, "workspace:001");
  assert.equal(upstreamBody.locale, "es");
  assert.equal(upstreamBody.context.currency, "MXN");
  assert.equal(upstreamBody.context.legalRegion, "MX");
  assert.equal(upstreamBody.context.timezone, "America/Mexico_City");
  assert.equal("productId" in upstreamBody, false);
  assert.equal("principalId" in upstreamBody, false);
  assert.equal("sessionId" in upstreamBody, false);
});

test("shadow browser composition requires server-side runtime config", () => {
  assert.throws(
    () => createWebAgentShadowBrowserComposition({}),
    /shadowRuntime/,
  );
});
