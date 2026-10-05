
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
    const error = new Error("Drive provider returned a non-object response");
    error.code = "INVALID_DRIVE_PROVIDER_RESPONSE";
    throw error;
  }
  if (response.ok !== true) {
    const error = new Error("Drive provider search did not succeed");
    error.code = "DRIVE_PROVIDER_SEARCH_FAILED";
    throw error;
  }
  if (response.mutated === true) {
    const error = new Error("Read-only Drive connector refuses mutated provider responses");
    error.code = "DRIVE_READ_ONLY_VIOLATION";
    throw error;
  }
  if (!Array.isArray(response.files)) {
    const error = new Error("Drive provider response.files must be an array");
    error.code = "INVALID_DRIVE_PROVIDER_RESPONSE";
    throw error;
  }
  return response.files;
}

function occurredAt(item) {
  const raw = item?.modifiedTime || item?.createdTime || item?.modified_at || item?.created_at || "";
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? String(raw).slice(0, 80) : parsed.toISOString();
}

/**
 * Read-only adapter for a document/file provider such as Google Drive.
 *
 * Required client contract:
 *   searchFiles({ query, limit }) -> { ok, files, mutated?: false }
 *
 * The federated layer receives metadata only. File bodies and binary bytes are
 * intentionally excluded from R2 and require the later governed-content gate.
 */
export function createDocumentStoreConnector({
  searchFiles,
  id = "google-drive",
  domain = "corporate",
} = {}) {
  if (typeof searchFiles !== "function") {
    const error = new Error("searchFiles function is required");
    error.code = "INVALID_DRIVE_CLIENT";
    throw error;
  }
  if (!["corporate", "legal", "institutional"].includes(domain)) {
    const error = new Error("document store domain must be corporate, legal or institutional");
    error.code = "INVALID_DRIVE_DOMAIN";
    throw error;
  }

  return Object.freeze({
    id: requiredText(id, "id"),
    type: "file",
    domains: Object.freeze([domain]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const limit = Number.isInteger(request?.limit) ? Math.min(request.limit, 50) : 20;
      const response = await searchFiles({ query, limit });
      const files = normalizeProviderResponse(response);

      return files.slice(0, limit).map((item, index) => {
        if (!item || typeof item !== "object") {
          const error = new Error("Drive provider file must be an object");
          error.code = "INVALID_DRIVE_PROVIDER_RESPONSE";
          throw error;
        }

        const providerId = requiredText(
          item.id || item.fileId || item.providerObjectId,
          "provider file id",
        );
        const name = clip(item.name || item.title || "Arquivo", 240);
        const mimeType = clip(item.mimeType || item.mime_type || "", 120);
        const modified = occurredAt(item);
        const size = Number.isFinite(Number(item.size)) ? Number(item.size) : null;
        const digest = hash(JSON.stringify({ providerId, name, mimeType, modified, size }));

        return {
          id: `file:${hash(`${id}:${providerId}`).slice(0, 24)}`,
          domain,
          title: name,
          snippet: [
            mimeType ? `Tipo: ${mimeType}` : "",
            modified ? `Atualizado: ${modified}` : "",
            size != null ? `Tamanho: ${size} bytes` : "",
          ].filter(Boolean).join(" · "),
          uri: `document-store://${encodeURIComponent(id)}/${hash(providerId).slice(0, 32)}`,
          occurredAt: modified,
          observedAt: typeof request?.requestedAt === "string" ? request.requestedAt : null,
          sensitivity: domain === "legal" ? "confidential" : "internal",
          providerObjectId: `sha256:${hash(providerId)}`,
          evidenceDigest: `sha256:${digest}`,
        };
      });
    },
  });
}

export const __test = Object.freeze({ normalizeProviderResponse, occurredAt });
