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
import { createWebAgentOperationalComposition } from "../src/web-agent-operational-composition.mjs";

const T0 = "2026-08-16T10:00:00.000Z";
const T1 = "2026-08-16T10:01:00.000Z";
const T2 = "2026-08-16T10:02:00.000Z";
const SESSION = "d".repeat(43);
const tenantId = "component.tenant.web-agent-clean-main";
const organizationId = "component.organization.web-agent-clean-main";
const principalId = "user:web-agent-clean-main";
const userId = "component.user.web-agent-clean-main";

const products = Object.freeze({
  uni: Object.freeze({
    workspaceId: "component.workspace.web-agent-clean-main.uni",
    productId: "product:uni-co",
    subscriptionId: "component.subscription.web-agent-clean-main.uni",
    entitlementId: "component.entitlement.web-agent-clean-main.uni",
    jobId: "component.provisioning.web-agent-clean-main.uni",
    grantId: "component.access.web-agent-clean-main.uni",
    roleId: "component.role.web-agent-clean-main.uni.member",
    membershipId: "component.membership.web-agent-clean-main.uni.member",
    sessionKey: "11111111-1111-4111-8111-111111111111",
    host: "unico.apidevelopers.digital",
    agentId: "uni.co",
    currency: "BRL",
    slug: "uni-co",
  }),
  nexus: Object.freeze({
    workspaceId: "component.workspace.web-agent-clean-main.nexus",
    productId: "product:nexus",
    subscriptionId: "component.subscription.web-agent-clean-main.nexus",
    entitlementId: "component.entitlement.web-agent-clean-main.nexus",
    jobId: "component.provisioning.web-agent-clean-main.nexus",
    grantId: "component.access.web-agent-clean-main.nexus",
    roleId: "component.role.web-agent-clean-main.nexus.member",
    membershipId: "component.membership.web-agent-clean-main.nexus.member",
    sessionKey: "22222222-2222-4222-8222-222222222222",
    host: "nexus.apidevelopers.digital",
    agentId: "nexus",
    currency: "USD",
    slug: "nexus",
  }),
});

async function seedProduct({
  saasRuntime,
  saasAccess,
  membershipRuntime,
  product,
}) {
  await saasRuntime.registerTenantWorkspace({
    tenant: {
      tenantId,
      organizationId,
      slug: "web-agent-clean-main",
      displayName: "Web Agent Clean Main",
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: product.workspaceId,
      tenantId,
      productId: product.productId,
      slug: product.slug,
      displayName: product.slug,
      status: "active",
      createdAt: T0,
    },
  });

  await saasRuntime.startSubscription({
    subscriptionId: product.subscriptionId,
    tenantId,
    productId: product.productId,
    planId: "shadow-clean-main",
    status: "assisted_activation",
    currency: product.currency,
    monthlyAmount: 0,
    createdAt: T0,
  });
  await saasRuntime.activateSubscription({
    subscriptionId: product.subscriptionId,
    activatedAt: T1,
  });
  await saasRuntime.grantEntitlement({
    entitlementId: product.entitlementId,
    subscriptionId: product.subscriptionId,
    tenantId,
    workspaceId: product.workspaceId,
    productId: product.productId,
    capability: "web-agent",
    status: "active",
    sourcePlanId: "shadow-clean-main",
    createdAt: T0,
  });
  await saasRuntime.enqueueProvisioning({
    provisioningJobId: product.jobId,
    subscriptionId: product.subscriptionId,
    tenantId,
    workspaceId: product.workspaceId,
    productId: product.productId,
    entitlementIds: [product.entitlementId],
    idempotencyKey: `clean-main:${product.slug}:v1`,
    requestedAt: T0,
  });
  await saasRuntime.claimProvisioning({
    provisioningJobId: product.jobId,
    at: T1,
  });
  await saasRuntime.completeProvisioning({
    provisioningJobId: product.jobId,
    result: { productReady: true },
    at: T2,
  });

  await saasAccess.grantAccess({
    accessGrantId: product.grantId,
    principalId,
    tenantId,
    workspaceId: product.workspaceId,
    productId: product.productId,
    subscriptionId: product.subscriptionId,
    entitlementId: product.entitlementId,
    requiredScopes: ["web:chat"],
    status: "pending",
    createdAt: T0,
  });
  await saasAccess.activateAccess({
    accessGrantId: product.grantId,
    provisioningJobId: product.jobId,
    at: T2,
  });

  await membershipRuntime.registerUser({
    userId,
    principalId,
    status: "active",
    createdAt: T0,
  });
  await membershipRuntime.registerRole({
    roleId: product.roleId,
    tenantId,
    workspaceId: product.workspaceId,
    scope: "workspace",
    key: "member",
    permissions: ["chat:use"],
    status: "active",
    createdAt: T0,
  });
  await membershipRuntime.addMembership({
    membershipId: product.membershipId,
    tenantId,
    workspaceId: product.workspaceId,
    userId,
    principalId,
    roleId: product.roleId,
    status: "active",
    createdAt: T0,
  });
}

async function seedContext(store) {
  const sessionHash = hashBrowserSessionSecret(SESSION);
  await store.transaction((tx) => {
    tx.put(webAgentShadowPersistenceCollections.browserSessions, sessionHash, {
      sessionHash,
      status: "active",
      expiresAt: "2026-08-16T23:59:59.000Z",
      principal: {
        id: principalId,
        tenantId,
        status: "active",
        scopes: ["web:chat"],
      },
    });
    tx.put(webAgentShadowPersistenceCollections.tenantInternationalProfiles, tenantId, {
      tenantId,
      defaultLocale: "pt-BR",
      fallbackLocale: "en",
      timeZone: "America/Sao_Paulo",
      legalRegion: "BR",
    });
    for (const product of Object.values(products)) {
      const commercialContextId = createWebAgentShadowCommercialContextId({
        tenantId,
        workspaceId: product.workspaceId,
        productId: product.productId,
      });
      tx.put(webAgentShadowPersistenceCollections.commercialContexts, commercialContextId, {
        commercialContextId,
        tenantId,
        workspaceId: product.workspaceId,
        productId: product.productId,
        currency: product.currency,
      });
    }
  });
}

test("clean main operational composition preserves SaaS authority, official host binding and read-only memory", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "apd-web-agent-clean-main-"));
  t.after(() => rm(dir, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const {
    saasRuntime,
    saasAccess,
    membershipRuntime,
  } = createSaasAccessComposition({
    store,
    clock: () => T0,
  });

  for (const product of Object.values(products)) {
    await seedProduct({
      saasRuntime,
      saasAccess,
      membershipRuntime,
      product,
    });
  }
  await seedContext(store);

  const backendCalls = [];
  const fallbackCalls = [];
  const composition = createWebAgentOperationalComposition({
    app: {
      async handleRequest(request) {
        fallbackCalls.push(request);
        return { status: 404, payload: { error: "fallback" } };
      },
    },
    store,
    env: {
      WEB_AGENT_SHADOW_ENABLED: "true",
      WEB_AGENT_SHADOW_BASE_URL: "http://runtime.test",
      WEB_AGENT_SHADOW_API_KEY: "synthetic-test-key",
      WEB_AGENT_SHADOW_ALLOW_INSECURE_HTTP: "true",
    },
    clock: () => T0,
    fetchImpl: async (_url, options) => {
      const body = JSON.parse(options.body);
      backendCalls.push(body);
      const expected =
        body.agentId === "nexus" ? "private NEXUS memory" : "private uni.co memory";
      assert.equal(body.context.memoryContext.mode, "read_only");
      assert.equal(body.context.memoryContext.data.summary, expected);
      assert.equal("agentId" in body.context.memoryContext, false);
      assert.equal("tenantId" in body.context.memoryContext, false);
      assert.equal("workspaceId" in body.context.memoryContext, false);
      assert.equal("contactKey" in body.context.memoryContext, false);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            ok: true,
            result: {
              agentId: body.agentId,
              runtime: body.agentId === "nexus" ? "nexus-runtime" : "uni-co-runtime",
              executed: false,
              sendAllowed: false,
              parts: [{ type: "text", text: `${body.agentId} clean-main shadow` }],
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

  await composition.memoryProvider.upsert({
    agentId: "uni.co",
    tenantId,
    workspaceId: products.uni.workspaceId,
    customerRef: principalId,
    data: { summary: "private uni.co memory", secret: "never-forward" },
    updatedAt: T0,
  });
  await composition.memoryProvider.upsert({
    agentId: "nexus",
    tenantId,
    workspaceId: products.nexus.workspaceId,
    customerRef: principalId,
    data: { summary: "private NEXUS memory", secret: "never-forward" },
    updatedAt: T0,
  });

  const cookie = `${browserSessionCookieName}=${SESSION}`;
  for (const product of Object.values(products)) {
    const response = await composition.app.handleRequest({
      method: "POST",
      url: "/v1/web-agent/conversations",
      headers: { cookie, host: product.host },
      body: {
        accessGrantId: product.grantId,
        workspaceId: product.workspaceId,
        conversationId: `conv:${product.agentId}`,
        sessionId: product.sessionKey,
        requestId: `request:${product.agentId}`,
        correlationId: `correlation:${product.agentId}`,
        locale: product.agentId === "nexus" ? "en" : "pt-BR",
        parts: [{ type: "text", text: "clean main" }],
        capabilities: ["text", "memory"],
      },
    });
    if (response.status !== 200) {
      console.error(`error: valid ${product.agentId} response ${response.status}: ${JSON.stringify(response.payload)}`);
    }
    assert.equal(response.status, 200, `valid ${product.agentId} response ${response.status}: ${JSON.stringify(response.payload)}`);
    assert.equal(response.payload.agent.id, product.agentId);
    assert.equal(response.payload.memory.read, true);
  }

  for (const crossed of [
    {
      host: products.uni.host,
      grantId: products.nexus.grantId,
      workspaceId: products.nexus.workspaceId,
    },
    {
      host: products.nexus.host,
      grantId: products.uni.grantId,
      workspaceId: products.uni.workspaceId,
    },
  ]) {
    const response = await composition.app.handleRequest({
      method: "POST",
      url: "/v1/web-agent/conversations",
      headers: { cookie, host: crossed.host },
      body: {
        accessGrantId: crossed.grantId,
        workspaceId: crossed.workspaceId,
        conversationId: "conv:cross",
        sessionId: "33333333-3333-4333-8333-333333333333",
        requestId: "request:cross",
        correlationId: "correlation:cross",
        locale: "en",
        parts: [{ type: "text", text: "cross" }],
        capabilities: ["text"],
      },
    });
    assert.equal(response.status, 403);
  }

  assert.equal(backendCalls.length, 2);
  assert.equal(fallbackCalls.length, 0);
});

test("clean main operational composition is disabled by default and delegates unchanged", async () => {
  const request = { method: "GET", url: "/health" };
  const base = {
    async handleRequest(value) {
      assert.equal(value, request);
      return { status: 200, payload: { ok: true } };
    },
  };
  const fakeStore = {
    read() {},
    transaction() {},
  };
  const composition = createWebAgentOperationalComposition({
    app: base,
    store: fakeStore,
    env: {},
  });
  assert.equal(composition.enabled, false);
  assert.equal(composition.app, base);
  const response = await composition.app.handleRequest(request);
  assert.equal(response.status, 200);
});
