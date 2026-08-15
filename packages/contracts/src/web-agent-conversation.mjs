const VERSION = 1;
const AGENTS = Object.freeze(["uni.co", "nexus"]);
const PART_TYPES = Object.freeze(["text", "image", "audio", "video", "file"]);
const CAPABILITIES = Object.freeze(["text", "image", "audio", "video", "vision", "memory", "tools"]);
const FORBIDDEN_KEYS = new Set([
  "apiKey", "api_key", "x-unico-api-key", "authorization", "password",
  "secret", "token", "accessToken", "refreshToken", "credential"
]);
const SAFE_ID = /^[a-z0-9][a-z0-9._:-]{2,127}$/i;

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function string(value, name) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${name} must be a non-empty string`);
  }
  return value.trim();
}

function safeId(value, name) {
  const normalized = string(value, name);
  if (!SAFE_ID.test(normalized) || normalized.includes("@")) {
    throw new TypeError(`${name} must be an opaque safe identifier`);
  }
  return normalized;
}

function iso(value, name) {
  const normalized = string(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new TypeError(`${name} must be an ISO date`);
  }
  return normalized;
}

function unique(values, allowed, name) {
  if (!Array.isArray(values)) throw new TypeError(`${name} must be an array`);
  const normalized = [...new Set(values.map((item, index) => string(item, `${name}[${index}]`)))];
  for (const item of normalized) {
    if (allowed && !allowed.includes(item)) throw new RangeError(`${name} contains unsupported value: ${item}`);
  }
  return normalized.sort();
}

function scanSecrets(value, path = "request") {
  if (!value || typeof value !== "object") return;
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.replace(/[-_]/g, "").toLowerCase();
    const explicitlySensitive =
      FORBIDDEN_KEYS.has(key) ||
      ["apikey", "authorization", "password", "secret", "token", "accesstoken",
       "refreshtoken", "credential", "bearer"].includes(normalizedKey);
    if (explicitlySensitive) {
      throw new Error(`${path}.${key} is forbidden in the browser contract`);
    }
    scanSecrets(child, `${path}.${key}`);
  }
}

function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value))) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}

function normalizePart(part, index) {
  object(part, `input.parts[${index}]`);
  const type = string(part.type, `input.parts[${index}].type`);
  if (!PART_TYPES.includes(type)) throw new RangeError(`input.parts[${index}].type is unsupported`);

  if (type === "text") {
    const text = string(part.text, `input.parts[${index}].text`);
    return { type, text };
  }

  const assetId = safeId(part.assetId, `input.parts[${index}].assetId`);
  const mimeType = string(part.mimeType, `input.parts[${index}].mimeType`);
  if (!mimeType.includes("/")) throw new TypeError(`input.parts[${index}].mimeType is invalid`);
  return { type, assetId, mimeType };
}

function assertIdentityBinding(request) {
  if (request.agent.id === "uni.co" && request.agent.runtime !== "uni-co-runtime") {
    throw new Error("uni.co must bind to uni-co-runtime");
  }
  if (request.agent.id === "nexus" && request.agent.runtime !== "nexus-runtime") {
    throw new Error("nexus must bind to nexus-runtime");
  }
}

export const webAgentConversationContractVersion = VERSION;
export const webAgentIds = AGENTS;
export const webAgentPartTypes = PART_TYPES;
export const webAgentCapabilities = CAPABILITIES;

export function assertWebAgentConversationRequest(request, name = "webAgentConversationRequest") {
  object(request, name);
  scanSecrets(request, name);

  if (request.schemaVersion !== VERSION) throw new Error(`${name}.schemaVersion must be ${VERSION}`);
  if (request.channel !== "web") throw new Error(`${name}.channel must be web`);

  object(request.agent, `${name}.agent`);
  if (!AGENTS.includes(request.agent.id)) throw new RangeError(`${name}.agent.id must be uni.co or nexus`);
  safeId(request.agent.runtime, `${name}.agent.runtime`);
  assertIdentityBinding(request);

  safeId(request.conversationId, `${name}.conversationId`);
  safeId(request.sessionId, `${name}.sessionId`);
  safeId(request.principalId, `${name}.principalId`);
  safeId(request.tenantId, `${name}.tenantId`);
  safeId(request.workspaceId, `${name}.workspaceId`);
  safeId(request.requestId, `${name}.requestId`);
  safeId(request.correlationId, `${name}.correlationId`);
  iso(request.createdAt, `${name}.createdAt`);

  object(request.input, `${name}.input`);
  if (!Array.isArray(request.input.parts) || request.input.parts.length === 0) {
    throw new Error(`${name}.input.parts must contain at least one part`);
  }
  request.input.parts.forEach((part, index) => normalizePart(part, index));
  unique(request.capabilities, CAPABILITIES, `${name}.capabilities`);

  object(request.policy, `${name}.policy`);
  for (const field of ["authenticated", "authorized", "tenantBound", "workspaceBound"]) {
    if (request.policy[field] !== true) throw new Error(`${name}.policy.${field} must be true`);
  }
  for (const field of ["secretsExposed", "crossTenantAccessAllowed", "automaticExternalExecutionAllowed"]) {
    if (request.policy[field] !== false) throw new Error(`${name}.policy.${field} must be false`);
  }

  return request;
}

export function createWebAgentConversationRequest(input = {}) {
  const request = {
    schemaVersion: VERSION,
    channel: "web",
    agent: {
      id: input.agentId,
      runtime: input.agentId === "uni.co" ? "uni-co-runtime" :
        input.agentId === "nexus" ? "nexus-runtime" : input.runtime,
    },
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    principalId: input.principalId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    requestId: input.requestId,
    correlationId: input.correlationId,
    locale: input.locale ?? "pt-BR",
    input: {
      parts: (input.parts ?? []).map(normalizePart),
    },
    capabilities: unique(input.capabilities ?? ["text"], CAPABILITIES, "capabilities"),
    createdAt: input.createdAt ?? new Date().toISOString(),
    policy: {
      authenticated: true,
      authorized: true,
      tenantBound: true,
      workspaceBound: true,
      secretsExposed: false,
      crossTenantAccessAllowed: false,
      automaticExternalExecutionAllowed: false,
    },
  };
  assertWebAgentConversationRequest(request);
  return freeze(structuredClone(request));
}

export function assertSameWebAgentBoundary(left, right) {
  assertWebAgentConversationRequest(left, "left");
  assertWebAgentConversationRequest(right, "right");
  for (const field of ["tenantId", "workspaceId", "principalId", "sessionId"]) {
    if (left[field] !== right[field]) throw new Error(`web agent boundary mismatch: ${field}`);
  }
  if (left.agent.id !== right.agent.id || left.agent.runtime !== right.agent.runtime) {
    throw new Error("web agent boundary mismatch: agent identity");
  }
  return true;
}

export function createWebAgentConversationResponse(input = {}) {
  const response = {
    schemaVersion: VERSION,
    requestId: safeId(input.requestId, "requestId"),
    correlationId: safeId(input.correlationId, "correlationId"),
    conversationId: safeId(input.conversationId, "conversationId"),
    agent: {
      id: string(input.agentId, "agentId"),
      runtime: string(input.runtime, "runtime"),
    },
    output: {
      parts: (input.parts ?? []).map(normalizePart),
    },
    memory: {
      read: Boolean(input.memoryRead),
      writeProposed: Boolean(input.memoryWriteProposed),
      writeExecuted: false,
    },
    tools: {
      proposals: Array.isArray(input.toolProposals) ? structuredClone(input.toolProposals) : [],
      executed: [],
    },
    externalExecution: {
      proposed: Boolean(input.externalExecutionProposed),
      executed: false,
      humanApprovalRequired: true,
    },
    createdAt: input.createdAt ?? new Date().toISOString(),
  };

  scanSecrets(response, "webAgentConversationResponse");
  if (!AGENTS.includes(response.agent.id)) throw new RangeError("response agent.id must be uni.co or nexus");
  assertIdentityBinding({ agent: response.agent });
  if (response.output.parts.length === 0) throw new Error("response output.parts must contain at least one part");
  iso(response.createdAt, "createdAt");

  return freeze(response);
}
