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

const T0 = "2026-08-15T18:00:00.000Z";
const T1 = "2026-08-15T18:01:00.000Z";
const T2 = "2026-08-15T18:02:00.000Z";
const SESSION = "b".repeat(43);

const ids = Object.freeze({
  tenant: "component.tenant.web-agent-isolation",
  org: "component.organization.web-agent-isolation",
  principal: "user:web-agent-isolation",
  uni: Object.freeze({
    workspace: "component.workspace.web-agent-isolation.uni",
    product: "product:uni-co",
    subscription: "component.subscription.web-agent-isolation.uni",
    entitlement: "component.entitlement.web-agent-isolation.uni",
    job: "component.provisioning.web-agent-isolation.uni",
    grant: "component.access.web-agent-isolation.uni",
  }),
  nexus: Object.freeze({
    workspace: "component.workspace.web-agent-isolation.nexus",
    product: "product:nexus",
    subscription: "component.subscription.web-agent-isolation.nexus",
    entitlement: "component.entitlement.web-agent-isolation.nexus",
    job: "component.provisioning.web-agent-isolation.nexus",
    grant: "component.access.web-agent-isolation.nexus",
  }),
});

async function seedProduct({ saasRuntime, saasAccess, profile, slug, displayName }) {
  await saasRuntime.registerTenantWorkspace({
    tenant: {
      tenantId: ids.tenant,
      organizationId: ids.org,
      slug: "web-agent-isolation",
      displayName: "Web Agent Isolation",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: profile.workspace,
      tenantId: ids.tenant,
      productId: profile.product,
      slug,
      displayName,
      status: "active",
      createdAt: T0,
    },
  });

  await saasRuntime.startSubscription({
    subscriptionId: profile.subscription,
    tenantId: ids.tenant,
    productId: profile.product,
    planId: "shadow-isolation",
    status: "assisted_activation",
    currency: "BRL",
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saasRuntime.activateSubscription({ subscriptionId: profile.subscription, activatedAt: T1 });

  await saasRuntime.grantEntitlement({
    entitlementId: profile.entitlement,
    subscriptionId: profile.subscription,
    tenantId: ids.tenant,
    workspaceId: profile.workspace,
    productId: ids.profile.product,
    capability: "web-agent",
    status: "active",
    sourcePlanId: "shadow-isolation",
    createdAt: T0,
  });

  await saasRuntime.enqueueProvisioning({
    provisioningJobId: profile.job,
    subscriptionId: profile.subscription,
    tenantId: ids.tenant,
    workspaceId: profile.workspace,
    productId: ids.product,
    entitlementIds: [profile.entitlement],
    idempotencyKey: `web-agent-isolation:${slug}:v1`,
    requestedAt: T0,
  });
  await saasRuntime.claimProvisioning({ provisioningJobId: profile.job, at: T1 });
  await saasRuntime.completeProvisioning({
    provisioningJobId: profile.job,
    result: { productReady: true },
    at: T2,
  });

  await saasAccess.grantAccess({
    accessGrantId: profile.grant,
    principalId: ids.principal,
    tenantId: ids.tenant,
    workspaceId: profile.workspace,
    productId: profile.product,
    subscriptionId: profile.subscription,
    entitlementId: profile.entitlement,
    requiredScopes: ["web:chat"],
    status: "pending",
    createdAt: T0,
  });
  await saasAccess.activateAccess({
    accessGrantId: profile.grant,
    provisioningJobId: profile.job,
    at: T2,
  });
}

async function seedPersistentContext(store) {
  const sessionHash = hashBrowserSessionSecret(SESSION);
  const uniCommercialId = createWebAgentShadowCommercialContextId({
    tenantId: ids.tenant,
    workspaceId: ids.uni.workspace,
    productId: ids.uni.product,
  });
  const nexusCommercialId = createWebAgentShadowCommercialContextId({
    tenantId: ids.tenant,
    workspaceId: ids.nexus.workspace,
    productId: ids.nexus.product,
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

    tx.put(webAgentShadowPersistenceCollections.commercialContexts, uniCommercialId, {
      commercialContextId: uniCommercialId,
      tenantId: ids.tenant,
      workspaceId: ids.uni.workspace,
      productId: ids.uni.product,
      currency: "BRL",
    });

    tx.put(webAgentShadowPersistenceCollections.commercialContexts, nexusCommercialId, {
      commercialContextId: nexusCommercialId,
      tenantId: ids.tenant,
      workspaceId: ids.nexus.workspace,
      productId: ids.nexus.product,
      currency: "USD",
    });
  });
}

function requestBody({ profile, grantId, agentId, sequence }) {
  return {
    accessGrantId: grantId,
    workspaceId: profile.workspace,
    productId: profile.product,
    agentId,
    conversationId: `conv:isolation:${sequence}`,
    sessionId: `session:isolation:${sequence}`,
    requestId: `request:isolation:${sequence}`,
    correlationId: `correlation:isolation:${sequence}`,
    locale: agentId === "nexus" ? "en" : "pt-BR",
    parts: [{ type: "text", text: `isolation ${sequence}` }],
    capabilities: ["text"],
  };
}

test("persisted managed shadow enforces bidirectional uni.co/NEXUS grant isolation", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-isolation-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });

  const { saasRuntime, saasAccess } = createSaasAccessComposition({ store, clock: () => T0 });
  await seedProduct({ saasRuntime, saasAccess, profile: ids.uni, slug: "uni-co", displayName: "uni.co" });
  await seedProduct({ saasRuntime, saasAccess, profile: ids.nexus, slug: "nexus", displayName: "NEXUS" });
  await seedPersistentContext(store);

  const calls = [];
  const managed = createWebAgentShadowManagedBootstrapOptions({
    operationalRuntime: { store },
    clock: () => T0,
    fetchImpl: async (_url, options) => {
      const upstream = JSON.parse(options.body);
      calls.push(upstream);
      const isNexus = upstream.agentId === "nexus";
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            result: {
              agentId: upstream.agentId,
              runtime: isNexus ? "nexus-runtime" : "uni-co-runtime",
              executed: false,
              sendAllowed: false,
              parts: [{ type: "text", text: isNexus ? "NEXUS isolated" : "uni.co isolated" }],
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
      WEB_AGENT_SHADOW_API_KEY: "fixture-isolation-key",
    },
    ...managed,
  });

  const headers = { cookie: `${browserSessionCookieName}=${SESSION}` };

  const uniAllowed = await bootstrap.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers,
    body: requestBody({ profile: ids.uni, grantId: ids.uni.grant, agentId: "uni.co", sequence: "uni-allowed" }),
  });
  assert.equal(uniAllowed.status, 200);
  assert.equal(JSON.parse(uniAllowed.body).agent.id, "uni.co");

  const uniGrantCannotAuthorizeNexus = await bootstrap.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers,
    body: requestBody({ profile: ids.nexus, grantId: ids.uni.grant, agentId: "nexus", sequence: "uni-grant-nexus-denied" }),
  });
  assert.equal(uniGrantCannotAuthorizeNexus.status, 403);
  assert.equal(JSON.parse(uniGrantCannotAuthorizeNexus.body).allowed, false);

  const nexusAllowed = await bootstrap.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers,
    body: requestBody({ profile: ids.nexus, grantId: ids.nexus.grant, agentId: "nexus", sequence: "nexus-allowed" }),
  });
  assert.equal(nexusAllowed.status, 200);
  assert.equal(JSON.parse(nexusAllowed.body).agent.id, "nexus");

  const nexusGrantCannotAuthorizeUni = await bootstrap.route.handle({
    method: "POST",
    url: "/v1/web-agent/conversations",
    headers,
    body: requestBody({ profile: ids.uni, grantId: ids.nexus.grant, agentId: "uni.co", sequence: "nexus-grant-uni-denied" }),
  });
  assert.equal(nexusGrantCannotAuthorizeUni.status, 403);
  assert.equal(JSON.parse(nexusGrantCannotAuthorizeUni.body).allowed, false);

  assert.equal(calls.length, 2, "denied cross-product requests must not reach the cognitive bridge");
  assert.deepEqual(calls.map((call) => call.agentId), ["uni.co", "nexus"]);
});