import { createHmac, timingSafeEqual } from "node:crypto";

function requireText(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function headerValue(headers, name) {
  if (typeof headers?.get === "function") return headers.get(name);
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return null;
}

function normalize(value) {
  if (value === undefined || value === null) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const text = String(raw).trim();
  return text || null;
}

function parseSignature(value) {
  const parts = {};
  for (const item of requireText(value, "x-signature").split(",")) {
    const index = item.indexOf("=");
    if (index < 0) continue;
    const key = item.slice(0, index).trim().toLowerCase();
    const val = item.slice(index + 1).trim();
    if (key && val) parts[key] = val;
  }
  if (!parts.ts || !parts.v1 || !/^\d+$/.test(parts.ts)) {
    throw new Error("invalid Mercado Pago webhook signature header");
  }
  return parts;
}

function safeHexEqual(left, right) {
  if (!/^[a-f0-9]+$/i.test(left) || !/^[a-f0-9]+$/i.test(right)) return false;
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

function verifyWebhookSignature({ headers = {}, query = {}, dataId, secret }) {
  const signature = parseSignature(headerValue(headers, "x-signature"));
  const requestId = normalize(headerValue(headers, "x-request-id"));
  const signedDataId = normalize(query["data.id"] ?? query.data_id ?? query.dataId ?? dataId);
  const manifest = [
    ...(signedDataId ? [`id:${signedDataId}`] : []),
    ...(requestId ? [`request-id:${requestId}`] : []),
    `ts:${signature.ts}`,
  ].join(";") + ";";
  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  if (!safeHexEqual(expected, signature.v1)) {
    throw new Error("Mercado Pago webhook signature verification failed");
  }
  return signedDataId;
}

function rawJson(rawBody) {
  const text = Buffer.isBuffer(rawBody)
    ? rawBody.toString("utf8")
    : rawBody instanceof Uint8Array
      ? Buffer.from(rawBody).toString("utf8")
      : String(rawBody ?? "");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Mercado Pago webhook body must be a JSON object");
  }
  return value;
}

function asId(value) {
  return value === undefined || value === null ? null : String(value);
}

function occurredAt(resource, notification) {
  const value =
    resource?.date_last_updated ??
    resource?.last_modified ??
    resource?.date_approved ??
    resource?.date_created ??
    notification?.date_created;
  if (!value || Number.isNaN(Date.parse(value))) {
    throw new TypeError("Mercado Pago event timestamp is invalid");
  }
  return new Date(value).toISOString();
}

export function createMercadoPagoHttpClient({
  accessToken,
  webhookSecret,
  fetchImpl = globalThis.fetch,
  apiBaseUrl = "https://api.mercadopago.com",
} = {}) {
  const token = requireText(accessToken, "accessToken");
  const secret = requireText(webhookSecret, "webhookSecret");
  if (typeof fetchImpl !== "function") throw new TypeError("fetchImpl must be a function");
  const base = new URL(apiBaseUrl);
  if (base.protocol !== "https:") throw new TypeError("apiBaseUrl must use https");

  async function request(path, { method = "GET", body, idempotencyKey } = {}) {
    const headers = {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {}),
    };
    const response = await fetchImpl(new URL(path, base), {
      method,
      headers,
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let payload = null;
    if (text.trim()) {
      try {
        payload = JSON.parse(text);
      } catch {
        throw new Error(`Mercado Pago returned non-JSON HTTP ${response.status}`);
      }
    }
    if (!response.ok) {
      const message = payload?.message ?? payload?.error ?? `HTTP ${response.status}`;
      const error = new Error(`Mercado Pago request failed: ${message}`);
      error.status = response.status;
      throw error;
    }
    return payload;
  }

  async function hydrate(notification, dataId) {
    const type = requireText(notification.type ?? notification.topic, "Mercado Pago webhook type");
    const resourceId = requireText(dataId ?? notification?.data?.id, "Mercado Pago webhook data.id");

    if (type === "subscription_preapproval") {
      const subscription = await request(`/preapproval/${encodeURIComponent(resourceId)}`);
      return {
        id: asId(notification.id) ?? `${type}:${resourceId}:${notification.action ?? "updated"}`,
        status: subscription.status,
        external_reference: asId(subscription.external_reference),
        occurredAt: occurredAt(subscription, notification),
        preapprovalId: asId(subscription.id),
        payerId: asId(subscription.payer_id),
      };
    }

    if (type === "subscription_authorized_payment") {
      const invoice = await request(`/authorized_payments/${encodeURIComponent(resourceId)}`);
      const preapprovalId = asId(invoice.preapproval_id);
      const subscription = preapprovalId
        ? await request(`/preapproval/${encodeURIComponent(preapprovalId)}`)
        : null;
      return {
        id: asId(notification.id) ?? `${type}:${resourceId}:${notification.action ?? "updated"}`,
        status: invoice?.payment?.status ?? invoice.status ?? invoice.summarized,
        external_reference: asId(subscription?.external_reference ?? invoice.external_reference),
        occurredAt: occurredAt(invoice, notification),
        preapprovalId,
        payerId: asId(subscription?.payer_id ?? invoice.payer_id),
      };
    }

    if (type === "payment") {
      const payment = await request(`/v1/payments/${encodeURIComponent(resourceId}}`);
      return {
        id: asId(notification.id) ?? `${type}:${resourceId}:${notification.action ?? "updated"}`,
        status: payment.status,
        external_reference: asId(payment.external_reference ?? payment?.metadata?.apd_subscription_id),
        occurredAt: occurredAt(payment, notification),
        preapprovalId: asId(
          payment?.metadata?.preapproval_id ?? payment?.metadata?.apd_provider_subscription_id,
        ),
        payerId: asId(payment?.payer?.id),
      };
    }

    throw new Error(`unsupported Mercado Pago webhook type: ${type}`);
  }

  return Object.freeze({
    async createSubscriptionPlan(payload, { idempotencyKey } = {}) {
      return request("/preapproval_plan", {
        method: "POST",
        body: payload,
        idempotencyKey: requireText(idempotencyKey, "idempotencyKey"),
      });
    },

    async verifyAndParseWebhook({ headers = {}, rawBody, query = {} } = {}) {
      const notification = rawJson(rawBody);
      const bodyDataId = normalize(notification?.data?.id);
      const signedDataId = verifyWebhookSignature({
        headers,
        query,
        dataId: bodyDataId,
        secret,
      });
      return hydrate(notification, signedDataId ?? bodyDataId);
    },
  });
}
