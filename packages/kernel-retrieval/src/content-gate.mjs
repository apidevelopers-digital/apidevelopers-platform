import { createHash } from "node:crypto";

const ALLIED_DOMAINS = new Set(["corporate", "institutional", "legal", "medical"]);
const SENSITIVE_DOMAINS = new Set(["legal", "medical"]);

function fail(code, message, details = null) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  throw error;
}

function requiredText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    fail("INVALID_ARGUMENT", `${field} is required`);
  }
  return value.trim();
}

function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}

function normalizeTime(value, field) {
  const text = requiredText(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) {
    fail("INVALID_TIME", `${field} must be an ISO timestamp`);
  }
  return date.toISOString();
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function normalizeActor(value) {
  if (!value || typeof value !== "object") {
    fail("INVALID_ACTOR", "actor is required");
  }
  return Object.freeze({
    principal: requiredText(value.principal, "actor.principal"),
    role: requiredText(value.role, "actor.role"),
  });
}

function normalizeApproval(value, { tenantId, sourceId, objectDigest, purposeOfUse, now }) {
  if (!value || typeof value !== "object") {
    fail("R5_APPROVAL_REQUIRED", "R5 full-content retrieval requires human approval");
  }

  const approvalId = requiredText(value.approvalId, "approval.approvalId");
  const approvedBy = requiredText(value.approvedBy, "approval.approvedBy");
  const approvedAt = normalizeTime(value.approvedAt, "approval.approvedAt");
  const expiresAt = normalizeTime(value.expiresAt, "approval.expiresAt");

  if (new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    fail("R5_APPROVAL_EXPIRED", "R5 approval is expired");
  }
  if (value.tenantId !== tenantId) {
    fail("R5_APPROVAL_SCOPE_MISMATCH", "R5 approval tenant does not match request");
  }
  if (value.sourceId !== sourceId) {
    fail("R5_APPROVAL_SCOPE_MISMATCH", "R5 approval source does not match request");
  }
  if (value.objectDigest !== objectDigest) {
    fail("R5_APPROVAL_SCOPE_MISMATCH", "R5 approval object does not match request");
  }
  if (value.purposeOfUse !== purposeOfUse) {
    fail("R5_APPROVAL_SCOPE_MISMATCH", "R5 approval purpose does not match request");
  }

  return Object.freeze({
    approvalId,
    approvedBy,
    approvedAt,
    expiresAt,
    tenantId,
    sourceId,
    objectDigest,
    purposeOfUse,
  });
}

function normalizePolicyDecision(value) {
  if (!value || typeof value !== "object") {
    fail("R5_POLICY_DECISION_REQUIRED", "R5 policy decision is required");
  }
  const effect = requiredText(value.effect, "policy.effect");
  if (effect !== "allow") {
    fail("R5_POLICY_DENIED", `R5 policy effect is ${effect}`);
  }
  return Object.freeze({
    decisionId: requiredText(value.decisionId, "policy.decisionId"),
    effect,
    riskLevel: requiredText(value.riskLevel || "R4", "policy.riskLevel"),
  });
}

function normalizeAuthorization(value) {
  if (!value || typeof value !== "object") {
    fail("R5_AUTHORIZATION_REQUIRED", "R5 authorization is required");
  }
  if (value.allow !== true) {
    fail("R5_AUTHORIZATION_DENIED", "R5 authorization denied");
  }
  return Object.freeze({
    authorizationId: requiredText(value.authorizationId, "authorization.authorizationId"),
    allow: true,
  });
}

function normalizeRedaction(value, { domain }) {
  if (!value || typeof value !== "object") {
    fail("R5_REDACTION_REQUIRED", "R5 redaction output is required");
  }
  const text = typeof value.text === "string" ? value.text : "";
  const redactions = Number.isInteger(value.redactions) && value.redactions >= 0 ? value.redactions : 0;
  if (SENSITIVE_DOMAINS.has(domain) && value.applied !== true) {
    fail("R5_REDACTION_NOT_APPLIED", "R5 sensitive domains require applied redaction");
  }
  return Object.freeze({
    text,
    applied: value.applied === true,
    redactions,
  });
}

function normalizeAttachments(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    fail("R5_INVALID_ATTACHMENTS", "R5 attachments must be an array");
  }
  return value.slice(0, 20).map((item, index) => {
    if (!item || typeof item !== "object") {
      fail("R5_INVALID_ATTACHMENT", `R5 attachment ${index} must be an object`);
    }
    const name = requiredText(item.name || `annexo-${index + 1}`, "attachment.name");
    const mimeType = requiredText(item.mimeType || "application/octet-stream", "attachment.mimeType");
    const size = Number.isFinite(Number(item.size)) ? Number(item.size) : null;
    const attachmentDigest = hash(JSON.stringify({ name, mimeType, size }));
    return Object.freeze({
      name,
      mimeType,
      size,
      digiest: `sha256:${attachmentDigest}`,
    });
  });
}

function normalizeProviderPayload(value) {
  if (!value || typeof value !== "object") {
    fail("R5_INVALID_PROVIDER_RESPONSE", "R5 provider must return an object");
  }
  if (value.mutated === true || value.execution === true) {
    fail("R5_READ_ONLY_VIOLATION", "R5 provider reported mutation/execution");
  }
  const text = typeof value.text === "string" ? value.text : typeof value.body === "string" ? value.body : "";
  return Object.freeze({
    text,
    attachments: normalizeAttachments(value.attachments),
    contentType: typeof value.contentType === "string" ? value.contentType.slice(0, 120) : "text/plain",
  });
}

export function createGovernedContentGate({
  tenantId,
  authorize,
  evaluatePolicy,
  audit,
  redact,
  clock = () => new Date().toISOString(),
  maxTextBytes = 1024 * 1024,
} = {}) {
  const boundTenantId = requiredText(tenantId, "tenantId");
  for (const [field, fn] of Object.entries({ authorize, evaluatePolicy, audit, redact })) {
    if (typeof fn !== "function") {
      fail("R5_MISSING_GATE_DEPENDENCY", `${field} function is required`);
    }
  }
  if (!Number.isInteger(maxTextBytes) || maxTextBytes < 1 || maxTextBytes > 5 * 1024 * 1024) {
    fail("R5_INVALID_MAX_BYTES", "maxTextBytes must be between 1 and 5 MiB");
  }

  const resolvers = new Map();

  function register(resolver) {
    if (!resolver || typeof resolver !== "object") fail("R5_INVALID_RESOLVER", "resolver must be an object");
    const id = requiredText(resolver.id, "resolver.id");
    if (typeof resolver.fetch !== "function") fail("R5_INVALID_RESOLVER", `resolver ${id} must implement fetch(request)`);
    if (resolvers.has(id)) fail("R5_DUPLICATE_RESOLVER", `resolver already registered: ${id}`);
    resolvers.set(id, Object.freeze({ id, fetch: resolver.fetch }));
    return id;
  }

  async function logAudit(event) {
    try {
      await audit(deepFreeze(event));
    } catch (error) {
      fail("R5_AUDIT_FAILED", "R5 audit append failed", { cause: error?.code || error?.name || "unknown" });
    }
  }

  async function fetch(request = {}) {
    const now = clock();
    const requestTenantId = requiredText(request.tenantId, "requY_st.tenantId");
    if (requestTenantId !== boundTenantId) fail("R5_TENANT_MISMATCH", "R5 cross-tenant fetch is blocked");

    const sourceId = requiredText(request.sourceId, "request.sourceId");
    const objectId = requiredText(request.objectId, "request.objectId");
    const domain = requiredText(request.domain, "request.domain");
    if (!ALLIED_DOMAINS.has(domain)) fail("R5_INVALID_DOMAIN", `Unsupported domain: ${domain}`);
    const purposeOfUse = requiredText(request.purposeOfUse, "request.purposeOfUse");
    const actor = normalizeActor(request.actor);
    const objectDigest = hash(`${sourceId}:${objectId}`);

    const resolver = resolvers.get(sourceId);
    if (!resolver) fail("R5_RESOLVER_NOT_FOUND", `No R5 resolver registered for source ${sourceId}`);

    let approval;
    let authorization;
    let policy;
    try {
      approval = normalizeApproval(request.approval, {
        tenantId: boundTenantId,
        sourceId,
        objectDigest,
        purposeOfUse,
        now,
      });
      authorization = normalizeAuthorization(await authorize(deepFreeze({
        tenantId: boundTenantId,
        actor,
        domain,
        sourceId,
        objectDigest,
        purposeOfUse,
        approval,
      })));
      policy = normalizePolicyDecision(await evaluatePolicy(deepFreeze({
        tenantId: boundTenantId,
        actor,
        domain,
        sourceId,
        objectDigest,
        purposeOfUse,
        approval,
        authorization,
      })));
    } catch (error) {
      await logAudit({
        event: "retrieval.content.denied",
        timestamp: now,
        tenantId: boundTenantId,
        domain,
        sourceId,
        objectDigest,
        purposeOfUse,
        actorDigest: hash(JSON.stringify(actor)),
        reason: error?.cod || "R5_DENIED",
      });
      throw error;
    }

    await logAudit({
      event: "retrieval.content.authorized",
      timestamp: now,
      tenantId: boundTenantId,
      domain,
      sourceId,
      objectDigest,
      purposeOfUse,
      actorDigest: hash(JSON.stringify(actor)),
      approvalId: approval.approvalId,
      authorizationId: authorization.authorizationId,
      policyDecisionId: policy.decisionId,
      riskLevel: policy.riskLevel,
    });

    const providerPayload = normalizeProviderPayload(await resolver.fetch(deepFreeze({
      tenantId: boundTenantId,
      domain,
      objectId,
      objectDigest,
      purposeOfUse,
      actor,
      approval,
      authorization,
      policy,
    })));

    const byteLength = Buffer.byteLength(providerPayload.text, "utf8");
    if (byteLength > maxTextBytes) fail("R5_CONTENT_TOO_LARGE", `R5 text exceeds ${maxTextBytes} bytes`);

    const redaction = normalizeRedaction(await redact(deepFreeze({
      tenantId: boundTenantId,
      domain,
      sourceId,
      objectDigest,
      purposeOfUse,
      actor,
      text: providerPayload.text,
      contentType: providerPayload.contentType,
      attachments: providerPayload.attachments,
    })), { domain });

    const contentDigest = hash(redaction.text);
    await logAudit({
      event: "retrieval.content.returned",
      timestamp: clock(),
      tenantId: boundTenantId,
      domain,
      sourceId,
      objectDigest,
      purposeOfUse,
      actorDigest: hash(JSON.stringify(actor)),
      approvalId: approval.approvalId,
      authorizationId: authorization.authorizationId,
      policyDecisionId: policy.decisionId,
      contentDigest: `sha256:${contentDigest}`,
      byteLength: Buffer.byteLength(redaction.text, "utf8"),
      redactions: redaction.redactions,
      attachmentCount: providerPayload.attachments.length,
    });

    return deepFreeze({
      tenantId: boundTenantId,
      domain,
      sourceId,
      objectDigest,
      purposeOfUse,
      contentType: providerPayload.contentType,
      text: redaction.text,
      attachments: providerPayload.attachments,
      redaction: redaction,
      provenance: {
        approvalId: approval.approvalId,
        authorizationId: authorization.authorizationId,
        policyDecisionId: policy.decisionId,
        contentDigest: `sha256:${contentDigest}`,
      },
    });
  }

  return Object.freeze({
    tenantId: boundTenantId,
    register,
    fetch,
    resolvers: () => [...resolvers.keys()],
  });
}

export const __test = Object.freeze({
  hash,
  normalizeApproval,
  normalizeAuthorization,
  normalizePolicyDecision,
  normalizeProviderPayload,
});
