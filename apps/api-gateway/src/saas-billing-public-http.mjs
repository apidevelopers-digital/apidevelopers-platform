import { safePublicCheckoutIntent } from "../../../packages/saas-billing/src/public-checkout.mjs";

const PUBLIC_BILLING_ROUTES = Object.freeze({
  checkoutIntent: "/v1/public/billing/checkout-intents",
});

const MAX_BODY_BYTES = 8 * 1024;
const FORBIDDEN_CLIENT_FIELDS = Object.freeze([
  "amountMinor",
  "currency",
  "provider",
  "providerMode",
  "successUrl",
  "cancelUrl",
  "tenantId",
  "workspaceId",
  "subscriptionId",
]);

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

function parseJsonBody(rawBody) {
  if (rawBody === undefined || rawBody === null) throw new TypeError("request body is required");
  const buffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : rawBody instanceof Uint8Array
      ? Buffer.from(rawBody)
      : Buffer.from(String(rawBody), "utf8");
  if (buffer.length === 0) throw new TypeError("request body is required");
  if (buffer.length > MAX_BODY_BYTES) throw new TypeError("request body is too large");
  const value = JSON.parse(buffer.toString("utf8"));
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("request body must be a JSON object");
  }
  return value;
}

function rejectClientAuthorityFields(body) {
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (Object.hasOwn(body, field)) throw new Error(`client field is not allowed: ${field}`);
  }
}

function requestFingerprint(headers) {
  const forwarded = String(headerValue(headers, "x-forwarded-for") ?? "").split(",")[0].trim();
  const realIp = String(headerValue(headers, "x-real-ip") ?? "").trim();
  return forwarded || realIp || "unknown";
}

export function createPublicBillingHttp({ publicCheckoutIntent, rateLimiter } = {}) {
  if (typeof publicCheckoutIntent?.create !== "function") {
    throw new TypeError("publicCheckoutIntent.create must be a function");
  }
  if (typeof rateLimiter?.check !== "function") {
    throw new TypeError("rateLimiter.check must be a function");
  }

  return Object.freeze({
    async handle({ method = "GET", pathname = "/", headers = {}, rawBody } = {}) {
      if (
        String(method).toUpperCase() !== "POST" ||
        pathname !== PUBLIC_BILLING_ROUTES.checkoutIntent
      ) {
        return null;
      }

      let body;
      try {
        body = parseJsonBody(rawBody);
        rejectClientAuthorityFields(body);
      } catch {
        return { status: 400, payload: { error: "invalid_public_checkout_request" } };
      }

      const origin = String(headerValue(headers, "origin") ?? "").trim();
      const idempotencyKey = String(
        headerValue(headers, "idempotency-key") ??
          headerValue(headers, "x-idempotency-key") ??
          "",
      ).trim();

      if (!origin || !idempotencyKey) {
        return { status: 400, payload: { error: "public_checkout_headers_required" } };
      }

      let limit;
      try {
        limit = await rateLimiter.check({
          origin,
          surfaceId: body.surfaceId,
          requestFingerprint: requestFingerprint(headers),
        });
      } catch {
        return { status: 503, payload: { error: "public_checkout_rate_limit_unavailable" } };
      }

      if (!limit || limit.allowed !== true) {
        return {
          status: 429,
          payload: {
            error: "public_checkout_rate_limited",
            retryAfterSeconds:
              Number.isSafeInteger(limit?.retryAfterSeconds) && limit.retryAfterSeconds >= 0
                ? limit.retryAfterSeconds
                : null,
          },
        };
      }

      try {
        const intent = await publicCheckoutIntent.create({
          priceId: body.priceId,
          payerEmail: body.payerEmail,
          surfaceId: body.surfaceId,
          origin,
          idempotencyKey,
          consentAccepted: body.consentAccepted === true,
        });

        return {
          status: 201,
          payload: safePublicCheckoutIntent(intent),
        };
      } catch (error) {
        const message = String(error?.message ?? "");
        if (message === "origin_not_allowed" || message === "unknown_billing_surface") {
          return { status: 403, payload: { error: "public_checkout_origin_rejected" } };
        }
        if (message === "billing_consent_required") {
          return { status: 400, payload: { error: "billing_consent_required" } };
        }
        return { status: 400, payload: { error: "public_checkout_rejected" } };
      }
    },
  });
}

export { PUBLIC_BILLING_ROUTES, MAX_BODY_BYTES };
