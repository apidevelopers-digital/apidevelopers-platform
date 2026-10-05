import { createHash } from "node:crypto";

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.code = "INVALID_ARGUMENT";
    throw error;
  }
  return value.trim();
}

function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizeSearchResponse(response) {
  if (!response || typeof response !== "object") {
    const error = new Error("WhatsApp provider returned a non-object response");
    error.code = "INVALID_WHATSAPP_PROVIDER_RESPONSE";
    throw error;
  }
  if (response.ok !== true) {
    const error = new Error("WhatsApp provider search did not succeed");
    error.code = "WHATSAPP_PROVIDER_SEARCH_FAILED";
    throw error;
  }
  if (response.messagesSent === true) {
    const error = new Error("Read-only WhatsApp connector refuses responses reporting message sends");
    error.code = "WHATSAPP_READ_ONLY_VIOLATION";
    throw error;
  }
  if (response.secretsExposed === true) {
    const error = new Error("WhatsApp connector refuses responses reporting exposed secrets");
    error.code = "WHATSAPP_SECRET_EXPOSURE";
    throw error;
  }
  if (!Array.isArray(response.results)) {
    const error = new Error("WhatsApp provider response.results must be an array");
    error.code = "INVALID_WHATSAPP_PROVIDER_RESPONSE";
    throw error;
  }
  return response.results;
}

function firstText(object, keys) {
  for (const key of keys) {
    const value = object?.[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function occurredAt(item) {
  const raw = firstText(item, [
    "occurredAt",
    "timestamp",
    "createdAt",
    "created_at",
    "date",
    "datetime",
  ]);
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw.slice(0, 80) : parsed.toISOString();
}

function opaqueMessageKey(item, index) {
  const stable = firstText(item, [
    "messageId",
    "message_id",
    "id",
    "providerObjectId",
    "provider_object_id",
  ]);
  const seed = stable || JSON.stringify({
    index,
    channel: firstText(item, ["channel", "channelId", "channel_id"]),
    occurredAt: occurredAt(item),
  });
  return hash(seed);
}

/**
 * Adapter for the UNICO/Zuni inbound WhatsApp exact-text search bridge.
 *
 * Required client contract:
 *   searchInbound({ query }) -> { ok, results, messagesSent, secretsExposed, ... }
 *
 * R2 intentionally returns metadata only. It never echoes message bodies, phone
 * numbers, contact names or provider identifiers into the generic federation.
 */
export function createUnicoWhatsAppConnector({
  searchInbound,
  id = "unico-whatsapp",
  domain = "corporate",
} = {}) {
  if (typeof searchInbound !== "function") {
    const error = new Error("searchInbound function is required");
    error.code = "INVALID_WHATSAPP_CLIENT";
    throw error;
  }
  if (!["corporate", "legal"].includes(domain)) {
    const error = new Error("WhatsApp connector domain must be corporate or legal");
    error.code = "INVALID_WHATSAPP_DOMAIN";
    throw error;
  }

  return Object.freeze({
    id: requiredText(id, "id"),
    type: "message",
    domains: Object.freeze([domain]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const response = await searchInbound({ query });
      const results = normalizeSearchResponse(response);

      return results.map((item, index) => {
        if (!item || typeof item !== "object") {
          const error = new Error("WhatsApp provider result must be an object");
          error.code = "INVALID_WHATSAPP_PROVIDER_RESPONSE";
          throw error;
        }

        const opaque = opaqueMessageKey(item, index);
        const channelPresent = Boolean(firstText(item, ["channel", "channelId", "channel_id"]));
        const time = occurredAt(item);

        return {
          id: `whatsapp:${opaque.slice(0, 24)}`,
          domain,
          title: "Mensagem WhatsApp",
          snippet: [
            channelPresent ? "Canal identificado pelo provedor" : "",
            time ? `Data: ${time}` : "",
          ].filter(Boolean).join(" · "),
          uri: `unico-whatsapp://message/${opaque.slice(0, 32)}`,
          occurredAt: time,
          observedAt:
            typeof request?.requestedAt === "string" ? request.requestedAt : null,
          sensitivity: domain === "legal" ? "confidential" : "internal",
          providerObjectId: `sha256:${opaque}`,
          evidenceDigest: `sha256:${hash(JSON.stringify({
            opaque,
            time,
            release: typeof response.release === "string" ? response.release : "",
            channelPresent,
          }))}`,
        };
      });
    },
  });
}

export const __test = Object.freeze({
  normalizeSearchResponse,
  occurredAt,
  opaqueMessageKey,
});
