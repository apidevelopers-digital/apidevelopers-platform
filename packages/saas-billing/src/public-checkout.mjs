import { randomUUID } from "node:crypto";

function requireText(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} is required`);
  }
  return value.trim();
}

function normalizeEmail(value) {
  const email = requireText(value, "payerEmail").toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new TypeError("payerEmail must be a valid email");
  }
  return email;
}

function normalizeOrigin(value) {
  const origin = requireText(value, "origin");
  const url = new URL(origin);
  if (!(url.protocol === "https:" || url.hostname === "localhost")) {
    throw new TypeError("origin must use https or localhost");
  }
  return url.origin;
}

function defineSurfaces(surfaces = []) {
  const map = new Map();
  for (const raw of surfaces) {
    const surfaceId = requireText(raw.surfaceId, "surfaceId");
    const productId = requireText(raw.productId, "productId").toLowerCase();
    if (map.has(surfaceId)) {
      throw new Error(`duplicate surfaceId: ${surfaceId}`);
    }
    const allowedOrigins = Object.freeze(
      (raw.allowedOrigins ?? []).map(normalizeOrigin),
    );
    if (!allowedOrigins.length) {
      throw new Error(`surface ${surfaceId} must allow one origin`);
    }

    const successUrl = new URL(requireText(raw.successUrl, "successUrl"));
    const cancelUrl = new URL(requireText(raw.cancelUrl, "cancelUrl"));
    if (successUrl.protocol !== "https:" || cancelUrl.protocol !== "https:") {
      throw new TypeError("surface return URLs must use https");
    }
    if (
      !allowedOrigins.includes(successUrl.origin) ||
      !allowedOrigins.includes(cancelUrl.origin)
    ) {
      throw new Error("surface_return_origin_not_allowed");
    }

    map.set(
      surfaceId,
      Object.freeze({
        surfaceId,
        productId,
        allowedOrigins,
        successUrl: successUrl.toString(),
        cancelUrl: cancelUrl.toString(),
      }),
    );
  }
  return map;
}

export function createPublicCheckoutIntentService({
  catalog,
  store,
  surfaces = [],
  mode = "test",
  clock = () => new Date(),
  idFactory = () => `pub_${randomUUID()}`,
} = {}) {
  if (typeof catalog?.get !== "function") {
    throw new TypeError("catalog.get must be a function");
  }
  if (
    typeof store?.getPublicCheckoutIntent !== "function" ||
    typeof store?.putPublicCheckoutIntent !== "function"
  ) {
    throw new TypeError(
      "store must provide public checkout intent methods",
    );
  }
  if (!["test", "live"].includes(mode)) {
    throw new TypeError("mode must be test or live");
  }

  const surfaceMap = defineSurfaces(surfaces);

  return Object.freeze({
    async create({
      priceId,
      payerEmail,
      surfaceId,
      origin,
      idempotencyKey,
      consentAccepted = false,
    } = {}) {
      const key = requireText(idempotencyKey, "idempotencyKey");

      const existing = await store.getPublicCheckoutIntent(key);
      if (existing) return existing;

      if (consentAccepted !== true) {
        throw new Error("billing_consent_required");
      }

      const surface = surfaceMap.get(requireText(surfaceId, "surfaceId"));
      if (!surface) throw new Error("unknown_billing_surface");

      const requestOrigin = normalizeOrigin(origin);
      if (!surface.allowedOrigins.includes(requestOrigin)) {
        throw new Error("origin_not_allowed");
      }

      const price = catalog.get(requireText(priceId, "priceId"));
      if (price.productId !== surface.productId) {
        throw new Error("billing_surface_product_mismatch");
      }
      const email = normalizeEmail(payerEmail);
      const createdAt = clock().toISOString();

      const intent = Object.freeze({
        intentId: idFactory(),
        idempotencyKey: key,
        status: "prepared",
        mode,
        provider: "mercadopago",
        providerInvocationAllowed: false,
        priceId: price.priceId,
        productId: price.productId,
        planId: price.planId,
        currency: price.currency,
        amountMinor: price.amountMinor,
        interval: price.interval,
        payerEmail: email,
        surfaceId: surface.surfaceId,
        successUrl: surface.successUrl,
        cancelUrl: surface.cancelUrl,
        createdAt,
      });

      await store.putPublicCheckoutIntent(key, intent);
      return intent;
    },
  });
}

export function safePublicCheckoutIntent(intent) {
  return Object.freeze({
    checkoutIntentId: intent.intentId,
    status: intent.status,
    mode: intent.mode,
    provider: intent.provider,
    providerInvocationAllowed: false,
    priceId: intent.priceId,
    productId: intent.productId,
    planId: intent.planId,
    currency: intent.currency,
    amountMinor: intent.amountMinor,
    interval: intent.interval,
    surfaceId: intent.surfaceId,
    createdAt: intent.createdAt,
  });
}
