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
import { createWebAgentShadowMemoryProvider } from "../src/web-agent-shadow-memory-provider.mjs";
import { createWebAgentShadowManagedBootstrapOptions } from "../src/web-agent-shadow-managed-bootstrap.mjs";
import { createWebAgentServerBootstrap } from "../src/web-agent-shadow-server-bootstrap.mjs";

const T0 = "2026-08-16T08:00:00.000Z";
const T1 = "2026-08-16T08:01:00.000Z";
const T2 = "2026-08-16T08:02:00.000Z";
const SESSION = "c".repeat(43);

const ids = Object.freeze({
  tenant: "component.tenant.web-agent-official-surface",
  org: "component.organization.web-agent-official-surface",
  principal: "user:web-agent-official-surface",
  uni: Object.freeze({
    workspace: "component.workspace.web-agent-official.uni",
    product: "product:uni-co",
    subscription: "component.subscription.web-agent-official.uni",
    entitlement: "component.entitlement.web-agent-official.uni",
    job: "component.provisioning.web-agent-official.uni",
    grant: "component.access.web-agent-official.uni",
    host: "unico.apidevelopers.digital",
    agent: "uni.co",
  }),
  nexus: Object.freeze({
    workspace: "component.workspace.web-agent-official.nexus",
    product: "product:nexus",
    subscription: "component.subscription.web-agent-official.nexus",
    entitlement: "component.entitlement.web-agent-official.nexus",
    job: "component.provisioning.web-agent-official.nexus",
    grant: "component.access.web-agent-official.nexus",
    host: "nexus.apidevelopers.digital",
    agent: "nexus",
  }),
});

async function seedProduct({ saasRuntime, saasAccess, profile, slug, displayName, currency }) {
  await saasRuntime.registerTenantWorkspace({
    tenant: {
      tenantId: ids.tenant,
      organizationId: ids.org,
      slug: "web-agent-official",
      displayName: "Web Agent Official Surface",
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
    planId: "shadow-official",
    status: "assisted_activation",
    currency,
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saasRuntime.activateSubscription({ subscriptionId: profile.subscription, activatedAt: T1 });

  await saasRuntime.grantEntitlement({
    entitlementId: profile.entitlement,
    subscriptionId: profile.subscription,
    tenantId: ids.tenant,
    workspaceId: profile.workspace,
    productId: profile.product,
    capability: "web-agent",
    status: "active",
    sourcePlanId: "shadow-official",
    createdAt: T0,
  });

  await saasRuntime.enqueueProvisioning({
    provisioningJobId: profile.job,
    subscriptionId: profile.subscription,
    tenantId: ids.tenant,
    workspaceId: profile.workspace,
    productId: profile.product,
    entitlementIds: [profile.entitlement],
    idempotencyKey: `web-agent-official:${slug}:v1`,
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
  const uniCommercialId = createWebAgentShadowCommercialContextId({tenantId:ids.tenant,workspaceId:ids.uni.workspace,productId:ids.uni.product});
  const nexusCommercialId = createWebAgentShadowCommercialContextId({tenantId:ids.tenant,workspaceId:ids.nexus.workspace,productId:ids.nexus.product});

  await store.transaction((tx) => {
    tx.put(webAgentShadowPersistenceCollections.browserSessions,sessionHash,{
      sessionHash,
      status: "active",
      expiresAt: "2026-08-16T23:59:59.000Z",
      principal: { id: ids.principal, tenantId: ids.tenant, status: "active", scopes: ["web:chat"] },
    });
    tx.put(webAgentShadowPersistenceCollections.tenantInternationalProfiles, ids.tenant,{
      tenantId: ids.tenant, defaultLocale: "pt-BR", fallbackLocale: "en", timeZone: "America/Sao_Paulo", legalRegion: "BR",
    });
    tx.put(webAgentShadowPersistenceCollections.commercialContexts, uniCommercialId, { commercialContextId:uniCommercialId,tenantId:ids.tenant,workspaceId:ids.uni.workspace,productId:ids.uni.product,currency:"BRL" });
    tx.put(webAgentShadowPersistenceCollections.commercialContexts, nexusCommercialId, { commercialContextId:nexusCommercialId,tenantId:ids.tenant,workspaceId:ids.nexus.workspace,productId:ids.nexus.product,currency:"USD" });
  });
}

async function seedMemory(store) {
  const provider = createWebAgentShadowMemoryProvider({ store });
  await provider.upsert({
    agentId: "uni.co",
    tenantId: ids.tenant,
    workspaceId: ids.uni.workspace,
    customerRef: ids.principal,
    data: {
      summary: "memória privada uni.co",
      nextBestAction: "responder com contexto uni.co",
      topics: ["uni.co"],
      secret: "never-forward",
    },
    updatedAt: T0,
  });
  await provider.upsert({
    agentId: "nexus",
    tenantId: ids.tenant,
    workspaceId: ids.nexus.workspace,
    customerRef: ids.principal,
    data: {
      summary: "memória privada NEXUS",
      nextBestAction: "responder com contexto NEXUS",
      topics: ["nexus"],
      secret: "never-forward",
    },
    updatedAt: T0,
  });
}

test("official hosts drive session SaaS memory and backend shadow for uni.co and NEXUS", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-official-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const { saasRuntime, saasAccess } = createSaasAccessComposition({ store, clock: () => T0 });
  await seedProduct({ saasRuntime, saasAccess, profile: ids.uni, slug: "uni-co", displayName: "uni.co", currency: "BRL" });
  await seedProduct({ saasRuntime, saasAccess, profile: ids.nexus, slug: "nexus", displayName: "NEXUS", currency: "USD" });
  await seedPersistentContext(store);
  await seedMemory(store);

  const calls = [];
  const managed = createWebAgentShadowManagedBootstrapOptions({
    operationalRuntime: { store },
    clock: () => T0,
    fetchImpl: async (_url, options) => {
      const upstream = JSON.parse(options.body);
      calls.push(upstream);
      const expectedSummary = upstream.agentId === "nexus"
        ? "memória privada NEXUS"
        : "memória privada uni.co";

      assert.equal(upstream.context.memoryContext.mode, "read_only");
      assert.equal(upstream.context.memoryContext.data.summary, expectedSummary);
      for (const key of ["agentId", "tenantId", "workspaceId", "contactKey"]) {
        assert.equal(key in upstream.context.memoryContext, false);
      }
      assert.equal("secret" in upstream.context.memoryContext.data, false);

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
              parts: [{ type: "text", text: isNexus ? "NEXUS official shadow" : "uni.co official shadow" }],
              memoryRead: true,
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
      WEB_AGENT_SHADOW_API_KEY: "fixture-official-key",
    },
    ...managed,
  });

  const cookie = `${browserSessionCookieName}=${SESSION}`;
  for (const [profile, expectedText] of [
    [ids.uni, "uni.co official shadow"],
    [ids.nexus, "NEXUS official shadow"],
  ]) {
    const response = await bootstrap.route.handle({
      method: "POST",
      url: "/v1/web-agent/conversations",
      headers: { cookie, host: profile.host },
      body: {
        accessGrantId: profile.grant,
        workspaceId: profile.workspace,
        conversationId: `conv:${profile.agent}`,
        sessionId: `session:${profile.agent}`,
        requestId: `request:${profile.agent}`,
        correlationId: `correlation:${profile.agent}`,
        locale: profile.agent === "nexus" ? "en" : "pt-BR",
        parts: [{ type: "text", text: "Hello official" }],
        capabilities: ["text", "memory"],
      },
    });

    assert.equal(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.equal(payload.agent.id, profile.agent);
    assert.equal(payload.output.parts[0].text, expectedText);
    assert.equal(payload.memoryRead, true);
  }

  for (const { host, grant, workspace } of [
    { host: ids.uni.host, grant: ids.nexus.grant, workspace: ids.nexus.workspace },
    { host: ids.nexus.host, grant: ids.uni.grant, workspace: ids.uni.workspace },
  ]) {
    const response = await bootstrap.route.handle({
      method: "POST",
      url: "/v1/web-agent/conversations",
      headers: { cookie, host },
      body: {
        accessGrantId: grant,
        workspaceId: workspace,
        conversationId: "conv:cross",
        sessionId: "session:cross",
        requestId: "request:cross",
        correlationId: "correlation:cross",
        locale: "en",
        parts: [{ type: "text", text: "spoof" }],
        capabilities: ["text"],
      },
    });
    assert.equal(response.status, 403);
  }

  assert.equal(calls.length, 2, "crossed grants must not reach the backend");
});
