import {
  MITRA_MCP_V1_VERSION,
  assertMitraMcpV1Tool,
  createMitraMcpV1ContractSummary,
  listMitraMcpV1Tools,
} from "./mitra-mcp-v1-contract.mjs";

const freeze = (value) => Object.freeze(value);

function nowIso() {
  return new Date().toISOString();
}

function normalizeScopes(scopes) {
  return Array.isArray(scopes) ? scopes.map((scope) => String(scope)) : [];
}

function hasRequiredScope({ scopes, requiredScope }) {
  const normalized = normalizeScopes(scopes);
  return normalized.includes("admin:*") || normalized.includes(requiredScope);
}

function createErrorResponse({ error, reason, retryable = false, needsHumanReview = false }) {
  return freeze({
    ok: false,
    error,
    reason,
    retryable,
    needsHumanReview,
  });
}

function resolveTenantId({ tenantId, context = {}, identity = {} }) {
  return (
    String(tenantId ?? "").trim() ||
    String(context.tenantId ?? "").trim() ||
    String(identity.tenantId ?? "").trim() ||
    String(identity.principal?.tenantId ?? "").trim()
  );
}

function resolveScopes({ context = {}, identity = {} }) {
  return [
    ...normalizeScopes(identity.scopes),
    ...normalizeScopes(identity.principal?.scopes),
    ...normalizeScopes(context.scopes),
  ];
}

function summarizeToolForCapability(tool) {
  return freeze({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    requiredScope: tool.requiredScope,
    backend: tool.backend,
    risk: tool.risk,
    mutatesState: tool.mutatesState,
    destructive: tool.destructive,
    humanReviewRequired: tool.humanReviewRequired,
  });
}

export function createMitraMcpV1Runtime({
  tenantId,
  clock = nowIso,
  capabilitiesProvider,
  limitsProvider,
} = {}) {
  async function executeTool({ name, input = {}, context = {}, identity = {} } = {}) {
    const tool = assertMitraMcpV1Tool(name);
    const resolvedTenantId = resolveTenantId({ tenantId, context, identity });
    if (!resolvedTenantId) {
      return createErrorResponse({
        error: "tenant_not_found",
        reason: "Mitra MCP v1 requires a tenant context before executing tools.",
      });
    }

    const scopes = resolveScopes({ context, identity });
    if (!hasRequiredScope({ scopes, requiredScope: tool.requiredScope })) {
      return createErrorResponse({
        error: "insufficient_scope",
        reason: `Required scope: ${tool.requiredScope}`,
      });
    }

    if (tool.name === "mitra.status") {
      return freeze({
        ok: true,
        service: "mitra-mcp",
        version: MITRA_MCP_V1_VERSION,
        tenantId: resolvedTenantId,
        timestamp: clock(),
      });
    }

    if (tool.name === "mitra.capabilities") {
      const availableTools = typeof capabilitiesProvider === "function"
        ? await capabilitiesProvider({ tenantId: resolvedTenantId, input, context, identity })
        : listMitraMcpV1Tools();

      const limits = typeof limitsProvider === "function"
        ? await limitsProvider({ tenantId: resolvedTenantId, input, context, identity })
        : {};

      return freeze({
        ok: true,
        tenantId: resolvedTenantId,
        tools: availableTools.map((item) => (typeof item === "string" ? item : item.name)),
        toolDefinitions: availableTools
          .filter((item) => typeof item !== "string")
          .map(summarizeToolForCapability),
        limits,
      });
    }

    return createErrorResponse({
      error: "dependency_unavailable",
      reason: `${tool.name} is registered but its backend adapter is not wired in Mitra MCP v1 runtime yet.`,
      retryable: false,
      needsHumanReview: tool.humanReviewRequired === true,
    });
  }

  return freeze({
    service: "mitra-mcp",
    version: MITRA_MCP_V1_VERSION,
    contract: createMitraMcpV1ContractSummary(),
    executeTool,
  });
}

export function createMitraMcpV1StatusResponse({ tenantId, timestamp = nowIso() } = {}) {
  const resolvedTenantId = String(tenantId ?? "").trim();
  if (!resolvedTenantId) {
    return createErrorResponse({
      error: "tenant_not_found",
      reason: "Missing tenant id.",
    });
  }

  return freeze({
    ok: true,
    service: "mitra-mcp",
    version: MITRA_MCP_V1_VERSION,
    tenantId: resolvedTenantId,
    timestamp,
  });
}

export function createMitraMcpV1CapabilitiesResponse({ tenantId, tools = listMitraMcpV1Tools(), limits = {} } = {}) {
  const resolvedTenantId = String(tenantId ?? "").trim();
  if (!resolvedTenantId) {
    return createErrorResponse({
      error: "tenant_not_found",
      reason: "Missing tenant id.",
    });
  }

  return freeze({
    ok: true,
    tenantId: resolvedTenantId,
    tools: tools.map((item) => (typeof item === "string" ? item : item.name)),
    toolDefinitions: tools
      .filter((item) => typeof item !== "string")
      .map(summarizeToolForCapability),
    limits,
  });
}
