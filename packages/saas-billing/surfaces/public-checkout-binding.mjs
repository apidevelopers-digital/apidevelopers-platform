import { BR_PUBLIC_SAAS_SURFACE_REGISTRY } from "./br-public-saas.mjs";

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function normalizeHttpsUrl(value, name) {
  const url = new URL(requireText(value, name));
  if (url.protocol !== "https:") {
    throw new TypeError(`${name} must use https`);
  }
  return url;
}

export function createPublicCheckoutSurfaceBinding({
  surfaceId,
  successUrl,
  cancelUrl,
  registry = BR_PUBLIC_SAAS_SURFACE_REGISTRY,
} = {}) {
  if (typeof registry?.get !== "function") {
    throw new TypeError("registry.get must be a function");
  }

  const surface = registry.get(requireText(surfaceId, "surfaceId"));

  if (surface.status !== "published") {
    throw new Error("billing_surface_not_published");
  }
  if (surface.checkoutEnabled !== true) {
    throw new Error("billing_surface_checkout_disabled");
  }

  const success = normalizeHttpsUrl(successUrl, "successUrl");
  const cancel = normalizeHttpsUrl(cancelUrl, "cancelUrl");
  if (success.origin !== surface.origin || cancel.origin !== surface.origin) {
    throw new Error("billing_surface_return_origin_mismatch");
  }

  return Object.freeze({
    surfaceId: surface.surfaceId,
    productId: surface.productId,
    allowedOrigins: Object.freeze([surface.origin]),
    successUrl: success.toString(),
    cancelUrl: cancel.toString(),
  });
}
