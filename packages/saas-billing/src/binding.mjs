function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  return value.trim();
}

export function assertHttpsUrl(value, name) {
  const url = new URL(requireText(value, name));
  if (url.protocol !== "https:") throw new TypeError(`${name} must use https`);
}

export function assertBillingBinding({ tenant, workspace, subscription, price }) {
  if (!tenant) throw new Error("billing tenant not found");
  if (!workspace) throw new Error("billing workspace not found");
  if (!subscription) throw new Error("billing subscription not found");
  if (tenant.status !== "active") throw new Error("billing tenant is not active");
  if (workspace.tenantId !== tenant.tenantId) throw new Error("billing workspace tenant boundary mismatch");
  if (subscription.tenantId !== tenant.tenantId) throw new Error("billing subscription tenant boundary mismatch");
  if (workspace.productId !== price.productId) throw new Error("billing workspace product boundary mismatch");
  if (subscription.productId !== price.productId) throw new Error("billing subscription product boundary mismatch");
  if (subscription.planId !== price.planId) throw new Error("billing subscription plan mismatch");
  if (subscription.currency !== price.currency) throw new Error("billing subscription currency mismatch");
}

export function requireBillingCheckoutInput(input = {}) {
  for (const name of ["checkoutIntentId","tenantId","workspaceId","subscriptionId","priceId","successUrl","cancelUrl"]) {
    requireText(input[name], name);
  }
  assertHttpsUrl(input.successUrl, "successUrl");
  assertHttpsUrl(input.cancelUrl, "cancelUrl");
  return input;
}
