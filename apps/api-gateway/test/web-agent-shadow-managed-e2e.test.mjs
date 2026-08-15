import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  browserSessionCookieName,
  hashBrowserSessionSecret,
} from "@apidevelopers/auth-core/browser-session-authenticator";
import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasAccessComposition } from "../src/saas-access-composition.mjs";
import {
  createWebAgentShadowCommercialContextId,
  webAgentShadowPersistenceCollections,
} from "../src/web-agent-shadow-persistence-providers.mjs";
import { createWebAgentShadowManagedBootstrapOptions } from "../src/web-agent-shadow-managed-bootstrap.mjs";
import { createWebAgentServerBootstrap } from "../src/web-agent-shadow-server-bootstrap.mjs";

const ids = Object.freeze({
  tenant: "component.tenant.web-agent-e2e",
  org: "component.organization.web-agent-e2e",
  workspace: "component.workspace.web-agent-e2e.uni-co",
  product: "product:uni-co",
  principal: "user:web-agent-e2e",
  subscription: "component.subscription.web-agent-e2e.uni-co",
  entitlement: "component.entitlement.web-agent-e2e.uni-co.chat",
  job: "component.provisioning.web-agent-e2e.uni-co",
  grant: "component.access.web-agent-e2e.uni-co.user",
});
const T0 = "2026-08-15T15:00:00.000Z";
const T1 = "2026-08-15T15:01:00.000Z";
const T2 = "2026-08-15T15:02:00.000Z";
const SESSION = "a".repeat(43);

async function seedSaas(store) {
  const { saasRuntime, saasAccess } = createSaasAccessComposition({ store, clock: () => T0 });

  await saasRuntime.registerTenantWorkspace({
    tenant: {
      tenantId: ids.tenant,
      organizationId: ids.org,
      slug: "web-agent-e2e",
      displayName: "Web Agent E2E",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: ids.workspace,
      tenantId: ids.tenant,
      productId: ids.product,
      slug: "uni-co",
      displayName: "uni.co",
      status: "active",
      createdAt: T0,
    },
  });

  await saasRuntime.startSubscription({
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    productId: ids.product,
    planId: "shadow-e2e",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saasRuntime.activateSubscription({ subscriptionId: ids.subscription, activatedAt: T1 });

  await saasRuntime.grantEntitlement({
    entitlementId: ids.entitlement,
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: ids.product,
    capability: "web-agent",
    status: "active",
    sourcePlanId: "shadow-e2e",
    createdAt: T0,
  });

  await saasRuntime.enqueueProvisioning({
    provisioningJobId: ids.job,
    subscriptionId: ids.subscription,
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: ids.product,
    entitlementIds: [ids.entitlement],
    idempotencyKey: "web-agent-e2e:uni-co:v1",
    requestedAt: T0,
  });
  await saasRuntime.claimProvisioning({ provisioningJobId: ids.job, at: T1 });
  await saasRuntime.completeProvisioning({
    provisioningJobId: ids.job,
    result: { productReady: true },
    at: T2,
  });

  await saasAccess.grantAccess({
    accessGrantId: ids.grant,
    principalId: ids.principal,
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: ids.product,
    subscriptionId: ids.subscription,
    entitlementId: ids.entitlement,
    requiredScopes: ["web:chat"],
    status: "pending",
    createdAt: T0,
  });
  await saasAccess.activateAccess({
    accessGrantId: ids.grant,
    provisioningJobId: ids.job,
    at: T2,
  });
}

async function seedWebContext(store) {
  const sessionHash = hashBrowserSessionSecret(SESSION);
  const commercialId = createWebAgentShadowCommercialContextId({
    tenantId: ids.tenant,
    workspaceId: ids.workspace,
    productId: ids.product,
  });

  await store.transaction((tx) => {
    tx.put(webAgentShadowPersistenceCollections.browserSessions, sessionHash, {
      sessionHash,
      status: "active",
      expiresAt: "2026-08-16T23:59:59.000Z",
      principal: {
        id: ids.principal,
        tenantId: ids.tenant,
        status: "active",
        scopes: ["web:chat"],
      },
    });
    tx.put(webAgentShadowPersistenceCollections.tenantInternationalProfiles, ids.tenant, {
      tenantId: ids.tenant,
      defaultLocale: "pt-BR",
      fallbackLocale: "en",
      timeZone: "America/Sao_Paulo",
      legalRegion: "BR",
    });
    tx.put(webAgentShadowPersistenceCollections.commercialContexts, commercialId, {
      commercialContextId: commercialId,
      tenantId: ids.tenant,
      workspaceId: ids.workspace,
      productId: ids.product,
      currency: "BRL",
    });
  });
}

test("persisted managed shadow proves browser-to-bridge E2E without external execution", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-e2e-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  await seedSaas(store);
  await seedWebContext(store);

  const calls = [];
  const managed = createWebAgentShadowManagedBootstrapOptions({
    operationalRuntime: { store },
    clock: () => T0,
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
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
              parts: [{ type: "text", text: "Resposta shadow persistida" }],
              memoryRead: false,
              memoryWriteProposed: false,
              toolProposals: [],
              externalExecutionProposed: false,
            },
          };
        },
      };
    },
  });

  const bootstrap = createWebAgentServerBootstrap({
    env: {
      WEB_AGENT_SHADOW_ENABLED: "true",
      WEB_AGENT_SHADOW_BASE_URL: "https://runtime.example",
      WEB_AGENT_SHADOW_API_KEY: "fixture-technical-key",
    },
    ...managed,
  });

  const response = await bootstrap.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers: {
      cookie: `${browserSessionCookieName}=${SESSION}`,
    },
    body: {
      accessGrantId: ids.grant,
      workspaceId: ids.workspace,
      productId: ids.product,
      agentId: "uni.co",
      conversationId: "conv:e2e:001",
      sessionId: "session:e2e:001",
      requestId: "request:e2e:001",
      correlationId: "correlation:e2e:001",
      locale: "pt-BR",
      parts: [{ type: "text", text: "Olá" }],
      capabilities: ["text"],
    },
  });

  assert.equal(response.status, 200);
  const payload = JSON.parse(response.body);
  assert.equal(payload.agent.id, "uni.co");
  assert.equal(payload.agent.runtime, "uni-co-runtime");
  assert.equal(payload.output.parts[0].text, "Resposta shadow persistida");
  assert.deepEqual(
    {
      locale: payload.internationalContext.locale,
      currency: payload.internationalContext.currency,
      legalRegion: payload.internationalContext.legalRegion,
      timeZone: payload.internationalContext.timeZone,
    },
    {
      locale: "pt-BR",
      currency: "BRL",
      legalRegion: "BR",
      timeZone: "America/Sao_Paulo",
    },
  );

  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.url, "https://runtime.example/v1/cognitive/web-agent/shadow");
  assert.equal(call.options.headers["x-unico-api-key"], "fixture-technical-key");
  assert.equal(call.options.headers["x-tenant-id"], ids.tenant);

  const upstream = JSON.parse(call.options.body);
  assert.equal(upstream.agentId, "uni.co");
  assert.equal(upstream.tenantId, ids.tenant);
  assert.equal(upstream.workspaceId, ids.workspace);
  assert.equal(upstream.context.currency, "BRL");
  assert.equal("productId" in upstream, false);
  assert.equal("principalId" in upstream, false);
  assert.equal("sessionId" in upstream, false);
});
