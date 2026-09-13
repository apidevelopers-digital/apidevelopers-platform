import { authorize } from "@apidevelopers/auth-core";

export const UNIJURI_ACCESS_INVENTORY_SCOPE = "operator:resource:read";
const PRODUCT_ID = "uni-juri";

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    }),
    body: JSON.stringify(payload),
  });
}

function values(state, collection) {
  const current = state?.collections?.[collection];
  if (!current || typeof current !== "object") return [];
  return Array.isArray(current) ? current : Object.values(current);
}

function pick(record, fields) {
  if (!record || typeof record !== "object") return null;
  return Object.freeze(Object.fromEntries(
    fields.filter((field) => record[field] !== undefined).map((field) => [field, record[field]]),
  ));
}

export function createUniJuriAccessInventoryApp({ authenticator, store } = {}) {
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator required");
  if (typeof store?.read !== "function") throw new TypeError("store required");

  return Object.freeze({
    async handleRequest(request = {}) {
      if (String(request.method ?? "GET").toUpperCase() !== "GET") {
        return jsonResponse(405, { ok: false, reason: "method_not_allowed", productionChanged: false });
      }

      const actor = await authenticator.authenticate(request.headers ?? {});
      if (!actor) return jsonResponse(401, { ok: false, reason: "unauthorized", productionChanged: false });
      const decision = authorize(actor, { scopes: [UNIJURI_ACCESS_INVENTORY_SCOPE] });
      if (!decision.allowed) {
        return jsonResponse(403, { ok: false, reason: "scope_forbidden", productionChanged: false });
      }

      const state = await store.read();
      const workspaces = values(state, "saas.workspaces").filter((item) => item?.productId === PRODUCT_ID);
      const subscriptions = values(state, "saas.subscriptions").filter((item) => item?.productId === PRODUCT_ID);
      const entitlements = values(state, "saas.entitments").filter((item) => item?.productId === PRODUCT_ID);
      const provisioningJobs = values(state, "saas.provisioningJobs").filter((item) => item?.productId === PRODUCT_ID);
      const accessGrants = values(state, "saas.accessGrants").filter((item) => item?.productId === PRODUCT_ID);

      const tenantIds = new Set([
        ...workspaces.map((item) => item.tenantId),
        ...subscriptions.map((item) => item.tenantId),
        ...entitlements.map((item) => item.tenantId),
        ...provisioningJobs.map((item) => item.tenantId),
        ...accessGrants.map((item) => item.tenantId),
      ].filter(Boolean));
      const tenants = values(state, "saas.tenants").filter((item) => tenantIds.has(item?.tenantId));
      const principals = values(state, "saas.federatedPrincipals").filter((item) => tenantIds.has(item?.tenantId));

      return jsonResponse(200, {
        ok: true,
        productId: PRODUCT_ID,
        revision: state?.revision ?? null,
        tenants: tenants.map((item) => pick(item, ["tenantId", "status", "name"])),
        workspaces: workspaces.map((item) => pick(item, ["workspaceId", "tenantId", "productId", "status", "name"])),
        subscriptions: subscriptions.map((item) => pick(item, ["subscriptionId", "tenantId", "productId", "planId", "status"])),
        entitlements: entitlements.map((item) => pick(item, ["entitlementId", "subscriptionId", "tenantId", "workspaceId", "productId", "capability", "status", "sourcePlanId"])),
        provisioningJobs: provisioningJobs.map((item) => pick(item, ["provisioningJobId", "subscriptionId", "tenantId", "workspaceId", "productId", "status", "entitlementIds"])),
        accessGrants: accessGrants.map((item) => pick(item, ["accessGrantId", "principalId", "subscriptionId", "entitlementId", "tenantId", "workspaceId", "productId", "requiredScopes", "grantedScopes", "status"])),
        principals: principals.map((item) => pick(item, ["federatedPrincipalId", "principalId", "tenantId", "provider", "externalSubjectHash", "subjectType", "status"])),
        productionChanged: false,
        secretsExposed: false,
      });
    },
  });
}
