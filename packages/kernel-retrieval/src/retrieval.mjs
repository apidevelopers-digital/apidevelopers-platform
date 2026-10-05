import { createHash } from "node:crypto";

const ALLOWED_DOMAINS = new Set([
  "corporate",
  "institutional",
  "legal",
  "medical",
]);

const ALLOWED_SOURCE_TYPES = new Set([
  "email",
  "file",
  "calendar",
  "message",
  "legal_case",
  "medical_record",
  "institutional_memory",
  "web",
  "other",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_ARGUMENT", `${field} is required`);
  }
  return value.trim();
}

function normalizeDomains(value) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("DOMAIN_SCOPE_REQUIRED", "At least one retrieval domain is required");
  }

  const domains = [...new Set(value.map((item) => requireText(item, "domain")))];
  for (const domain of domains) {
    if (!ALLOWED_DOMAINS.has(domain)) {
      fail("INVALID_DOMAIN", `Unsupported retrieval domain: ${domain}`);
    }
  }
  return domains;
}

function normalizeMedicalContext(domains, value) {
  if (!domains.includes("medical")) {
    return null;
  }

  if (!value || typeof value !== "object") {
    fail(
      "MEDICAL_CONTEXT_REQUIRED",
      "Medical retrieval requires an explicit medicalContext",
    );
  }

  return Object.freeze({
    subjectId: requireText(value.subjectId, "medicalContext.subjectId"),
    purposeOfUse: requireText(
      value.purposeOfUse,
      "medicalContext.purposeOfUse",
    ),
  });
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) {
    deepFreeze(child);
  }
  return value;
}

function normalizeConnector(connector) {
  if (!connector || typeof connector !== "object") {
    fail("INVALID_CONNECTOR", "Connector must be an object");
  }

  const id = requireText(connector.id, "connector.id");
  const type = requireText(connector.type, "connector.type");
  if (!ALLOWED_SOURCE_TYPES.has(type)) {
    fail("INVALID_CONNECTOR_TYPE", `Unsupported connector type: ${type}`);
  }

  const domains = normalizeDomains(connector.domains);
  if (typeof connector.search !== "function") {
    fail("INVALID_CONNECTOR", `Connector ${id} must implement search(request)`);
  }

  return Object.freeze({
    id,
    type,
    domains,
    search: connector.search,
  });
}

function clip(value, maxLength) {
  if (typeof value !== "string") {
    return "";
  }
  const text = value.trim();
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}…`;
}

function normalizeResult({ connector, raw, domain }) {
  if (!raw || typeof raw !== "object") {
    fail(
      "INVALID_CONNECTOR_RESULT",
      `Connector ${connector.id} returned a non-object result`,
    );
  }

  const id = requireText(raw.id, "result.id");
  const observedAt =
    typeof raw.observedAt === "string" && raw.observedAt.trim()
      ? raw.observedAt.trim()
      : null;

  const base = {
    id,
    source: Object.freeze({
      connectorId: connector.id,
      sourceType: connector.type,
      domain,
    }),
    title: clip(raw.title, 240),
    snippet: clip(raw.snippet, 600),
    uri: typeof raw.uri === "string" ? clip(raw.uri, 1000) : "",
    occurredAt:
      typeof raw.occurredAt === "string" ? raw.occurredAt.trim() : null,
    observedAt,
    sensitivity:
      typeof raw.sensitivity === "string" ? raw.sensitivity.trim() : "internal",
    provenance: Object.freeze({
      providerObjectId:
        typeof raw.providerObjectId === "string"
          ? clip(raw.providerObjectId, 300)
          : id,
      evidenceDigest:
        typeof raw.evidenceDigest === "string"
          ? clip(raw.evidenceDigest, 128)
          : null,
    }),
  };

  if (domain === "medical") {
    return deepFreeze({
      ...base,
      title:
        typeof raw.safeLabel === "string" && raw.safeLabel.trim()
          ? clip(raw.safeLabel, 160)
          : "Registro médico",
      snippet: "",
      uri: "",
      sensitivity: "restricted",
    });
  }

  return deepFreeze(base);
}

function makeQueryId(payload) {
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 24);
}

export function createFederatedRetrieval({
  tenantId,
  connectors = [],
  clock = () => new Date().toISOString(),
} = {}) {
  const boundTenantId = requireText(tenantId, "tenantId");
  const registry = new Map();

  function register(connector) {
    const normalized = normalizeConnector(connector);
    if (registry.has(normalized.id)) {
      fail("DUPLICATE_CONNECTOR", `Connector already registered: ${normalized.id}`);
    }
    registry.set(normalized.id, normalized);
    return normalized.id;
  }

  for (const connector of connectors) {
    register(connector);
  }

  async function search(request = {}) {
    const requestTenantId = requireText(request.tenantId, "request.tenantId");
    if (requestTenantId !== boundTenantId) {
      fail("TENANT_MISMATCH", "Cross-tenant retrieval is blocked");
    }

    if (request.includeContent === true) {
      fail(
        "CONTENT_RETRIEVAL_NOT_SUPPORTED",
        "v0.1 returns governed metadata/snippets only; full content requires a later audited gate",
      );
    }

    const query = requireText(request.query, "request.query");
    const domains = normalizeDomains(request.domains);
    const medicalContext = normalizeMedicalContext(domains, request.medicalContext);
    const limit = Number.isInteger(request.limit) ? request.limit : 20;
    if (limit < 1 || limit > 50) {
      fail("INVALID_LIMIT", "limit must be between 1 and 50");
    }

    const sourceIds =
      request.sourceIds == null
        ? null
        : new Set(
            Array.isArray(request.sourceIds)
              ? request.sourceIds.map((item) => requireText(item, "sourceId"))
              : fail("INVALID_ARGUMENT", "sourceIds must be an array"),
          );

    const selected = [...registry.values()].filter((connector) => {
      if (sourceIds && !sourceIds.has(connector.id)) {
        return false;
      }
      return connector.domains.some((domain) => domains.includes(domain));
    });

    const requestedAt = clock();
    const queryId = makeQueryId({
      tenantId: boundTenantId,
      query,
      domains,
      sourceIds: sourceIds ? [...sourceIds].sort() : null,
      requestedAt,
    });

    const batches = await Promise.all(
      selected.map(async (connector) => {
        const connectorDomains = connector.domains.filter((domain) =>
          domains.includes(domain),
        );

        const raw = await connector.search(
          deepFreeze({
            tenantId: boundTenantId,
            query,
            domains: connectorDomains,
            limit,
            medicalContext,
            requestedAt,
            queryId,
          }),
        );

        if (!Array.isArray(raw)) {
          fail(
            "INVALID_CONNECTOR_RESPONSE",
            `Connector ${connector.id} must return an array`,
          );
        }

        return raw.map((item) => {
          const domain =
            typeof item.domain === "string" &&
            connectorDomains.includes(item.domain)
              ? item.domain
              : connectorDomains[0];
          return normalizeResult({ connector, raw: item, domain });
        });
      }),
    );

    return deepFreeze({
      queryId,
      tenantId: boundTenantId,
      domains,
      requestedAt,
      medicalScopeApplied: Boolean(medicalContext),
      connectorCount: selected.length,
      results: batches.flat().slice(0, limit),
    });
  }

  return Object.freeze({
    tenantId: boundTenantId,
    register,
    search,
    connectors: () =>
      [...registry.values()].map(({ id, type, domains }) =>
        deepFreeze({ id, type, domains: [...domains] }),
      ),
  });
}

export const retrievalDomains = Object.freeze([...ALLOWED_DOMAINS]);
export const retrievalSourceTypes = Object.freeze([...ALLOWED_SOURCE_TYPES]);
