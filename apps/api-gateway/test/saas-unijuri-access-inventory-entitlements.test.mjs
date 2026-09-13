import test from "node:test";
import assert from "node:assert/strict";

import { createUniJuriAccessInventoryApp } from "../src/saas-unijuri-access-inventory.mjs";

test("UniJuri inventory reads the canonical saas.entitlements collection", async () => {
  const app = createUniJuriAccessInventoryApp({
    authenticator: {
      async authenticate() {
        return Object.freeze({
          role: "service",
          principal: Object.freeze({
            id: "operator",
            tenantId: "tenant_uni",
            status: "active",
            scopes: Object.freeze(["operator:resource:read"]),
          }),
        });
      },
    },
    store: {
      async read() {
        return {
          revision: 1,
          collections: {
            "saas.workspaces": {
              w1: {
                workspaceId: "w1",
                tenantId: "tenant_uni",
                productId: "uni-juri",
                status: "active",
              },
            },
            "saas.entitlements": {
              e1: {
                entitlementId: "e1",
                subscriptionId: "s1",
                tenantId: "tenant_uni",
                workspaceId: "w1",
                productId: "uni-juri",
                capability: "use_product",
                status: "active",
                sourcePlanId: "internal",
              },
            },
          },
        };
      },
    },
  });

  const response = await app.handleRequest({ method: "GET", headers: {} });
  assert.equal(response.status, 200);

  const body = JSON.parse(response.body);
  assert.equal(body.entitlements.length, 1);
  assert.equal(body.entitlements[0].entitlementId, "e1");
  assert.equal(body.entitlements[0].status, "active");
  assert.equal(body.entitlements[0].productId, "uni-juri");
  assert.equal(body.productionChanged, false);
  assert.equal(body.secretsExposed, false);
});
