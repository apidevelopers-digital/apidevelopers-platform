
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

function clip(value, max) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function normalizeProviderResponse(response) {
  if (!response || typeof response !== "object") {
    const error = new Error("Calendar provider returned a non-object response");
    error.code = "INVALID_CALENDAR_PROVIDER_RESPONSE";
    throw error;
  }
  if (response.ok !== true) {
    const error = new Error("Calendar provider search did not succeed");
    error.code = "CALENDAR_PROVIDER_SEARCH_FAILED";
    throw error;
  }
  if (response.mutated === true) {
    const error = new Error("Read-only Calendar connector refuses mutated provider responses");
    error.code = "CALENDAR_READ_ONLY_VIOLATION";
    throw error;
  }
  if (!Array.isArray(response.events)) {
    const error = new Error("Calendar provider response.events must be an array");
    error.code = "INVALID_CALENDAR_PROVIDER_RESPONSE";
    throw error;
  }
  return response.events;
}

function normalizeTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim().slice(0, 80) : parsed.toISOString();
}

/**
 * Read-only calendar adapter.
 *
 * Required client contract:
 *   searchEvents({ query, limit }) -> { ok, events, mutated?: false }
 *
 * Attendee identities, descriptions, meeting links and locations do not cross
 * the generic R2 federation boundary.
 */
export function createCalendarConnector({
  searchEvents,
  id = "google-calendar",
  domain = "corporate",
} = {}) {
  if (typeof searchEvents !== "function") {
    const error = new Error("searchEvents function is required");
    error.code = "INVALID_CALENDAR_CLIENT";
    throw error;
  }
  if (!["corporate", "legal"].includes(domain)) {
    const error = new Error("calendar domain must be corporate or legal");
    error.code = "INVALID_CALENDAR_DOMAIN";
    throw error;
  }

  return Object.freeze({
    id: requiredText(id, "id"),
    type: "calendar",
    domains: Object.freeze([domain]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const limit = Number.isInteger(request?.limit) ? Math.min(request.limit, 50) : 20;
      const response = await searchEvents({ query, limit });
      const events = normalizeProviderResponse(response);

      return events.slice(0, limit).map((item) => {
        if (!item || typeof item !== "object") {
          const error = new Error("Calendar provider event must be an object");
          error.code = "INVALID_CALENDAR_PROVIDER_RESPONSE";
          throw error;
        }

        const providerId = requiredText(
          item.id || item.eventId || item.providerObjectId,
          "provider event id",
        );
        const title = clip(item.summary || item.title || "Compromisso", 240);
        const start = normalizeTime(item.start?.dateTime || item.start?.date || item.start);
        const end = normalizeTime(item.end?.dateTime || item.end?.date || item.end);
        const status = clip(item.status || "", 60);
        const digest = hash(JSON.stringify({ providerId, title, start, end, status }));

        return {
          id: `calendar:${hash(`${id}:${providerId}`).slice(0, 24)}`,
          domain,
          title,
          snippet: [
            start ? `Início: ${start}` : "",
            end ? `Fim: ${end}` : "",
            status ? `Status: ${status}` : "",
          ].filter(Boolean).join(" · "),
          uri: `calendar-store://${encodeURIComponent(id)}/${hash(providerId).slice(0, 32)}`,
          occurredAt: start,
          observedAt: typeof request?.requestedAt === "string" ? request.requestedAt : null,
          sensitivity: domain === "legal" ? "confidential" : "internal",
          providerObjectId: `sha256:${hash(providerId)}`,
          evidenceDigest: `sha256:${digest}`,
        };
      });
    },
  });
}

export const __test = Object.freeze({ normalizeProviderResponse, normalizeTime });
