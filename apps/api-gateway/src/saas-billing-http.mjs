const BILLING_ROUTES = Object.freeze({
  checkout: "/v1/saas/billing/checkout",
  mercadoPagoWebhook: "/v1/saas/billing/webhooks/mercadopago",
});

function parseJsonBody(rawBody) {
  if (rawBody === undefined || rawBody === null) {
    throw new TypeError("request body is required");
  }
  const text = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : rawBody instanceof Uint8Array
      ? Buffer.from(rawBody).toString("utf8")
      : String(rawBody);
  if (!text.trim()) throw new TypeError("request body is required");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("request body must be a JSON object");
  }
  return value;
}

function safeCheckout(checkout) {
  return Object.freeze({
    checkoutIntentId: checkout.checkoutIntentId,
    checkoutUrl: checkout.checkoutUrl,
    expiresAt: checkout.expiresAt ?? null,
    currency: checkout.currency,
    amountMinor: checkout.amountMinor,
    interval: checkout.interval,
    provider: checkout.provider,
    providerMode: checkout.providerMode,
  });
}

export function createSaasBillingHttp({ authenticator, saasBilling } = {}) {
  if (
    authenticator !== undefined &&
    typeof authenticator?.authenticate !== "function"
  ) {
    throw new TypeError("authenticator.authenticate must be a function");
  }

  if (
    saasBilling !== undefined &&
    (
      typeof saasBilling?.createCheckout !== "function" ||
      typeof saasBilling?.handleWebhook !== "function"
    )
  ) {
    throw new TypeError(
      "saasBilling must provide createCheckout and handleWebhook",
    );
  }

  return Object.freeze({
    async handle({
      method = "GET",
      pathname = "/",
      headers = {},
      rawBody,
    } = {}) {
      const normalizedMethod = String(method).toUpperCase();
      const isCheckout =
        normalizedMethod === "POST" && pathname === BILLING_ROUTES.checkout;
      const isMercadoPagoWebhook =
        normalizedMethod === "POST" &&
        pathname === BILLING_ROUTES.mercadoPagoWebhook;

      if (!isCheckout && !isMercadoPagoWebhook) return null;

      if (!saasBilling) {
        return {
          status: 503,
          payload: { error: "saas_billing_unavailable" },
        };
      }

      if (isMercadoPagoWebhook) {
        try {
          const event = await saasBilling.handleWebhook({ headers, rawBody });
          return {
            status: 200,
            payload: {
              received: true,
              eventId: event?.eventId ?? null,
              transition: event?.transition ?? null,
            },
          };
        } catch {
          return {
            status: 400,
            payload: { error: "invalid_billing_webhook" },
          };
        }
      }

      if (!authenticator) {
        return {
          status: 503,
          payload: { error: "authentication_unavailable" },
        };
      }

      const identity = await authenticator.authenticate(headers);
      if (!identity) {
        return {
          status: 401,
          payload: { error: "unauthorized" },
        };
      }

      const tenantId = identity?.principal?.tenantId;
      if (!tenantId) {
        return {
          status: 403,
          payload: { error: "tenant_context_unavailable" },
        };
      }

      let body;
      try {
        body = parseJsonBody(rawBody);
      } catch {
        return {
          status: 400,
          payload: { error: "invalid_json_body" },
        };
      }

      if (body.tenantId !== undefined && body.tenantId !== tenantId) {
        return {
          status: 403,
          payload: { error: "tenant_context_mismatch" },
        };
      }

      try {
        const checkout = await saasBilling.createCheckout({
          checkoutIntentId: body.checkoutIntentId,
          tenantId,
          workspaceId: body.workspaceId,
          subscriptionId: body.subscriptionId,
          priceId: body.priceId,
          successUrl: body.successUrl,
          cancelUrl: body.cancelUrl,
        });
        return {
          status: 201,
          payload: safeCheckout(checkout),
        };
      } catch {
        return {
          status: 400,
          payload: { error: "billing_checkout_rejected" },
        };
      }
    },
  });
}

export { BILLING_ROUTES };
