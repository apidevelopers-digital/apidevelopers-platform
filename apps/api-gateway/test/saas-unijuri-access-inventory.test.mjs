import test from "node:test";
import assert from "node:assert/strict";

import { createUniJuriAccessInventoryApp } from "../src/saas-unijuri-access-inventory.mjs";

function actor(scopes = ["operator:resource:read"]) {
  return Object.freeze({ role: "service", principal: Object.freeze({ id: "operator", tenantId: "tenant_uni", scopes }) });
}

function storeWithState() {
  return {
    read: async () => ({
      revision: 7,
      collections: {
        "saas.tenants": { tenant_uni: { tenantId: "tenant_uni", status: "active", name: "Uni" } },
        "saas.workspaces": {
          w1: { workspaceId: "w1", tenantId: "tenant_uni", productId: "uni-juri", status: "active" },
          w2: { workspaceId: "w2", tenantId: "tenant_other", productId: "zuni", status: "active" },
        },
        "saas.subscriptions": { s1: { subscriptionId: "s1", tenantId: "tenant_uni", productId: "uni-juri", planId: "internal", status: "active" } },
        "saas.entitlements": { e1: { entitlementId: "e1", subscriptionId: "s1", tenantId: "tenant_uni", workspaceId: "w1", productId: "uni-juri", capability: "use_product", status: "active" } },
        "saas.provisioningJobs": { j1: { provisioningJobId: "j1", subscriptionId: "s1", tenantId: "tenant_uni", workspaceId: "w1", productId: "uni-juri", status: "succeeded", entitlementIds: ["e1"] } },
        "saas.accessGrants": {},
        "saas.federatedPrincipals": { p1: { federatedPrincipalId: "fp1", principalId: "principal1", tenantId: "tenant_uni", provider: "unico", externalSubjectHash: "a".repeat(64), status: "active" } },
      },
    }),
  };
}

test("UniJuri inventory is read-only and product scoped", async () => {
  const app = createUniJuriAccessInventoryApp({
    authenticator: { authenticate: async () => actor() },
    store: storeWithState(),
  });
  const response = await app.handleRequest({ method: "GET", headers: {} });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.productId, "uni-juri");
  assert.equal(body.workspaces.length, 1);
  assert.equal(body.workspaces[0].workspaceId, "w1");
  assert.equal(body.accessGrants.length, 0);
  assert.equal(body.productionChanged, false);
  assert.equal(body.secretsExposed, false);
});

test("UniJuri inventory rejects callers without operator read scope", async () => {
  const app = createUniJuriAccessInventoryApp({
    authenticator: { authenticate: async () => actor(["saas:access:delegate"]) },
    store: storeWithState(),
  });
  const response = await app.handleRequest({ method: "GET", headers: {} });
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).reason, "scope_forbidden");
});

test("UniJuri inventory rejects non-GET methods without reading state", async () => {
  let reads = 0;
  const app = createUniJuriAccessInventoryApp({
    authenticator: { authenticate: async () => actor() },
    store: { read: async () => { reads += 1; return { collections: {} }; } },
  });
  const response = await app.handleRequest({ method: "POST", headers: {} });
  assert.equal(response.status, 405);
  assert.equal(reads, 0);
});
