
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

function normalizeDirectoryResponse(response) {
  if (!response || typeof response !== "object" || response.ok !== true) {
    const error = new Error("Peterle/Mitra directory provider did not succeed");
    error.code = "MITRA_DIRECTORY_PROVIDER_FAILED";
    throw error;
  }
  if (response.execution === true || response.read_only === false) {
    const error = new Error("Peterle/Mitra legal connector requires read-only provider responses");
    error.code = "MITRA_READ_ONLY_VIOLATION";
    throw error;
  }
  if (!Array.isArray(response.results)) {
    const error = new Error("Peterle/Mitra directory response.results must be an array");
    error.code = "INVALID_MITRA_DIRECTORY_RESPONSE";
    throw error;
  }
  return response.results;
}

function normalizeMattersResponse(response) {
  if (!response || typeof response !== "object" || response.ok !== true) {
    const error = new Error("Peterle/Mitra matters provider did not succeed");
    error.code = "MITRA_MATTERS_PROVIDER_FAILED";
    throw error;
  }
  if (response.execution === true || response.read_only === false) {
    const error = new Error("Peterle/Mitra legal connector requires read-only provider responses");
    error.code = "MITRA_READ_ONLY_VIOLATION";
    throw error;
  }
  const rows = Array.isArray(response.results)
    ? response.results
    : Array.isArray(response.rows)
      ? response.rows
      : [];
  return rows;
}

function isoOrNull(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value.trim().slice(0, 80) : parsed.toISOString();
}

/**
 * Read-only Peterle/Mitra connector.
 *
 * Required client contracts:
 *   searchClients({ query, limit }) -> { ok, read_only:true, execution:false, results:[...] }
 *   searchMatters({ query, limit }) -> { ok, read_only:true, execution:false, results|rows:[...] }
 *
 * This R3 layer returns only governed legal metadata. Client/provider IDs are
 * hashed before leaving the connector, and no document body crosses this gate.
 */
export function createPeterleMitraConnector({
  searchClients,
  searchMatters,
  id = "peterle-mitra",
} = {}) {
  if (typeof searchClients !== "function") {
    const error = new Error("searchClients function is required");
    error.code = "INVALID_MITRA_CLIENT";
    throw error;
  }
  if (typeof searchMatters !== "function") {
    const error = new Error("searchMatters function is required");
    error.code = "INVALID_MITRA_CLIENT";
    throw error;
  }

  return Object.freeze({
    id: requiredText(id, "id"),
    type: "legal_case",
    domains: Object.freeze(["legal"]),

    async search(request) {
      const query = requiredText(request?.query, "request.query");
      const limit = Number.isInteger(request?.limit) ? Math.min(request.limit, 50) : 20;
      const requestedAt = typeof request?.requestedAt === "string" ? request.requestedAt : null;

      const [clientResponse, matterResponse] = await Promise.all([
        searchClients({ query, limit }),
        searchMatters({ query, limit }),
      ]);

      const clients = normalizeDirectoryResponse(clientResponse);
      const matters = normalizeMattersResponse(matterResponse);
      const results = [];

      for (const item of clients.slice(0, limit)) {
        if (!item || typeof item !== "object") continue;
        const providerId = requiredText(item.id || item.client_id, "client id");
        const label = clip(item.display_name || item.name || "Cliente", 180);
        const providerHash = hash(providerId);

        results.push({
          id: `legal-client:${providerHash.slice(0, 24)}`,
          domain: "legal",
          title: label,
          snippet: "Cadastro de cliente no read-model jurídico",
          uri: `peterle-mitra://client/${providerHash.slice(0, 32)}`,
          occurredAt: null,
          observedAt: requestedAt,
          sensitivity: "confidential",
          providerObjectId: `sha256:${providerHash}`,
          evidenceDigest: `sha256:${hash(JSON.stringify({ kind: "client", providerHash, label }))}`,
        });
      }

      for (const item of matters.slice(0, limit)) {
        if (!item || typeof item !== "object") continue;
        const providerId = requiredText(item.id || item.matter_id, "matter id");
        const clientId = requiredText(item.client_id || "unknown", "matter client id");
        const providerHash = hash(providerId);
        const clientHash = hash(clientId);
        const title = clip(item.title || "Processo/assunto jurídico", 220);
        const status = clip(item.status || "", 80);
        const createdAt = isoOrNull(item.created_at || item.createdAt);

        results.push({
          id: `legal-matter:${providerHash.slice(0, 24)}`,
          domain: "legal",
          title,
          snippet: [
            status ? `Status: ${status}` : "",
            createdAt ? `Criado: ${createdAt}` : "",
          ].filter(Boolean).join(" · "),
          uri: `peterle-mitra://matter/${providerHash.slice(0, 32)}`,
          occurredAt: createdAt,
          observedAt: requestedAt,
          sensitivity: "confidential",
          providerObjectId: `sha256:${providerHash}`,
          evidenceDigest: `sha256:${hash(JSON.stringify({
            kind: "matter",
            providerHash,
            clientHash,
            title,
            status,
            createdAt,
          }))}`,
        });
      }

      return results.slice(0, limit);
    },
  });
}

export const __test = Object.freeze({
  normalizeDirectoryResponse,
  normalizeMattersResponse,
  isoOrNull,
});
