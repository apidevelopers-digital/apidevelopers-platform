import { createHash } from "node:crypto";

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    const error = new Error(`${field} is required`);
    error.code = "INVALID_ARGUMENT";
    throw error;
  }
  return value.trim();
}

function clip(value, max) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function normalizeDate(message) {
  const raw =
    typeof message?.internalDate === "string" && message.internalDate.trim()
      ? message.internalDate.trim()
      : typeof message?.date === "string"
        ? message.date.trim()
        : "";
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

function digestMessage(message) {
  const stable = {
    uid: message?.uid ?? null,
    messageId: message?.messageId ?? "",
    internalDate: message?.internalDate ?? "",
    from: message?.from ?? "",
    to: message?.to ?? "",
    subject: message?.subject ?? "",
    contentType: message?.contentType ?? "",
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

function safeMailbox(value) {
  return requiredText(value || "INBOX", "mailbox").replace(/[^A-Za-z0-9._/-]/g, "_");
}

function normalizeSearchResponse(response) {
  if (!response || typeof response !== "object") {
    const error = new Error("mail provider returned a non-object response");
    error.code = "INVALID_MAIL_PROVIDER_RESPONSE";
    throw error;
  }
  if (response.ok !== true) {
    const error = new Error("mail provider search did not succeed");
    error.code = "MAIL_PROVIDER_SEARCH_FAILED";
    error.details = {
      partial: Boolean(response.partial),
      errors: Array.isArray(response.errors) ? response.errors.slice(0, 10) : [],
    };
    throw error;
  }
  if (!Array.isArray(response.messages)) {
    const error = new Error("mail provider response.messages must be an array");
    error.code = "INVALID_MAIL_PROVIDER_RESPONSE";
    throw error;
  }
  return response.messages;
}

/**
 * Adapter for the Peterle institutional mail bridge.
 *
 * Required client contract:
 *   searchMail({ account, mailbox, query, limit }) -> peterleMailSearch response
 *
 * The connector intentionally uses header/full-text search only. It never calls
 * uid:<n> from the federated search layer, so message bodies and attachment
 * bytes do not cross the generic retrieval gate in R2.
 */
export function createPeterleMailConnector({
  searchMail,
  id = "peterle-mail",
  account = "milena",
  mailbox = "INBOX",
  domains = ["corporate", "legal"],
} = {}) {
  if (typeof searchMail !== "function") {
    const error = new Error("searchMail function is required");
    error.code = "INVALID_MAIL_CLIENT";
    throw error;
  }

  const boundAccount = requiredText(account, "account").toLowerCase();
  const boundMailbox = safeMailbox(mailbox);
  const connectorId = requiredText(id, "id");

  return Object.freeze({
    id: connectorId,
    type: "email",
    domains: Object.freeze([...domains]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const limit = Number.isInteger(request?.limit) ? Math.min(request.limit, 50) : 20;
      const requestedDomains = Array.isArray(request?.domains) ? request.domains : [];
      const domain = requestedDomains.includes("legal") ? "legal" : "corporate";

      const response = await searchMail({
        account: boundAccount,
        mailbox: boundMailbox,
        query,
        limit,
      });

      const messages = normalizeSearchResponse(response);
      return messages.slice(0, limit).map((message) => {
        const uid = Number.parseInt(String(message?.uid ?? ""), 10);
        if (!Number.isInteger(uid) || uid < 1) {
          const error = new Error("mail message uid is required");
          error.code = "INVALID_MAIL_PROVIDER_RESPONSE";
          throw error;
        }

        const from = clip(message?.from, 220);
        const to = clip(message?.to, 220);
        const date = normalizeDate(message);
        const subject = clip(message?.subject || "(sem assunto)", 240);
        const providerObjectId = `uid:${uid}`;
        const evidenceDigest = `sha256:${digestMessage(message)}`;

        const snippetParts = [
          from ? `De: ${from}` : "",
          to ? `Para: ${to}` : "",
          date ? `Data: ${date}` : "",
          message?.attachmentHint === true ? "Anexo: indicado pelo provedor" : "",
        ].filter(Boolean);

        return {
          id: `mail:${boundAccount}:${boundMailbox}:${uid}`,
          domain,
          title: subject,
          snippet: clip(snippetParts.join(" · "), 600),
          uri: `peterle-mail://${boundAccount}/${encodeURIComponent(boundMailbox)}/${uid}`,
          occurredAt: date,
          observedAt:
            typeof request?.requestedAt === "string" ? request.requestedAt : null,
          sensitivity: domain === "legal" ? "confidential" : "internal",
          providerObjectId,
          evidenceDigest,
        };
      });
    },
  });
}

export const __test = Object.freeze({
  normalizeDate,
  digestMessage,
  normalizeSearchResponse,
});
