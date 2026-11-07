import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import { createTenantId, createWorkspaceId } from "../../contracts/src/saas-tenancy.mjs";
import { createSubscriptionId } from "../../contracts/src/saas-commercial.mjs";
import { createSaasRuntime } from "../../saas-runtime/src/index.mjs";
import { createBillingCatalog, createSaasBillingRuntime } from "../src/index.mjs";

export const T0 = "2026-08-11T04:00:00.000Z";
export const T1 = "2026-08-11T04:01:00.000Z";

export function ids(slug = "acme", productId = "unico") {
  return {
    tenantId: createTenantId(slug),
    organizationId: createCanonicalId({ family: "component", segments: ["organization", slug] }),
    workspaceId: createWorkspaceId(slug, `${productId}-main`),
    subscriptionId: createSubscriptionId(slug, productId),
  };
}

export async function withBilling(work, { eventFactory, providerMode = "test" } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-billing-"));
  const store = createJsonFileStore({ filePath: join(dir, "state.json"), fsync: false, clock: () => T0 });
  const saasRuntime = createSaasRuntime({ store, clock: () => T0 });
  const calls = [];
  const provider = {
    name: "provider-fixture",
    mode: providerMode,
    async createCheckoutSession(input) {
      calls.push(input);
      return {
        providerCheckoutId: `checkout:${input.checkoutIntentId}`,
        checkoutUrl: "https://payments.example.test/checkout/session-1",
        expiresAt: "2026-08-11T05:00:00.000Z",
      };
    },
    async verifyAndParseWebhook(input) {
      if (!eventFactory) throw new Error("signature verification failed");
      return eventFactory(input);
    },
  };
  const catalog = createBillingCatalog([{
    priceId: "unico-pro-brl-month", productId: "unico", planId: "pro",
    currency: "BRL", interval: "month", amountMinor: 59700, taxBehavior: "exclusive",
  }]);
  const billing = createSaasBillingRuntime({ store, saasRuntime, catalog, provider, clock: () => T1 });
  try { return await work({ store, saasRuntime, billing, provider, calls }); }
  finally { await rm(dir, { recursive: true, force: true }); }
}

export async function seedPending(saasRuntime) {
  const x = ids();
  await saasRuntime.registerTenantWorkspace({
    tenant: { tenantId:x.tenantId, organizationId:x.organizationId, slug:"acme", displayName:"Acme", status:"active", createdAt:T0 },
    workspace: { workspaceId:x.workspaceId, tenantId:x.tenantId, productId:"unico", slug:"unico-main", displayName:"uni.co Main", status:"active", createdAt:T0 },
  });
  await saasRuntime.startSubscription({
    subscriptionId:x.subscriptionId, tenantId:x.tenantId, productId:"unico", planId:"pro",
    status:"assisted_activation", currency:"BRL", monthlyAmount:597, createdAt:T0,
  });
  return x;
}
