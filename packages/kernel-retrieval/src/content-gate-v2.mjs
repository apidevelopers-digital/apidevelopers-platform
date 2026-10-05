import { createHash } from "node:crypto";

const DOMAINS = new Set(["corporate", "institutional", "legal", "medical"]);
const SENSITIVE = new Set(["legal", "medical"]);

function fail(code, message, details) {
  const error = new Error(message);
  error.code = code;
  if (details) error.details = details;
  throw error;
}
function req(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("INVALID_ARGUMENT", `${field} is required`);
  return value.trim();
}
function hash(value) {
  return createHash("sha256").update(String(value ?? "")).digest("hex");
}
function iso(value, field) {
  const text = req(value, field);
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) fail("INVALID_TIME", `${field} must be an ISO timestamp`);
  return date.toISOString();
}
function freeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) freeze(child);
  return value;
}
function actorOf(value) {
  if (!value || typeof value !== "object") fail("INVALID_ACTOR", "actor is required");
  return Object.freeze({ principal: req(value.principal, "actor.principal"), role: req(value.role, "actor.role") });
}
function approvalOf(value, scope) {
  if (!value || typeof value !== "object") fail("R5_APPROVAL_REQUIRED", "R5 full-content retrieval requires human approval");
  const approval = {
    approvalId: req(value.approvalId, "approval.approvalId"),
    approvedBy: req(value.approvedBy, "approval.approvedBy"),
    approvedAt: iso(value.approvedAt, "approval.approvedAt"),
    expiresAt: iso(value.expiresAt, "approval.expiresAt"),
    tenantId: value.tenantId,
    sourceId: value.sourceId,
    objectDigest: value.objectDigest,
    purposeOfUse: value.purposeOfUse,
  };
  if (new Date(approval.expiresAt).getTime() <= new Date(scope.now).getTime()) fail("R5_APPROVAL_EXPIRED", "R5 approval is expired");
  for (const field of ["tenantId", "sourceId", "objectDigest", "purposeOfUse"]) {
    if (approval[field] !== scope[field]) fail("R5_APPROVAL_SCOPE_MISMATCH", `R5 approval ${field} does not match request`);
  }
  return Object.freeze(approval);
}
function authorizationOf(value) {
  if (!value || typeof value !== "object") fail("R5_AUTHORIZATION_REQUIRED", "R5 authorization is required");
  if (value.allow !== true) fail("R5_AUTHORIZATION_DENIED", "R5 authorization denied");
  return Object.freeze({ authorizationId: req(value.authorizationId, "authorization.authorizationId"), allow: true });
}
function policyOf(value) {
  if (!value || typeof value !== "object") fail("R5_POLICY_DECISION_REQUIRED", "R5 policy decision is required");
  const effect = req(value.effect, "policy.effect");
  if (effect !== "allow") fail("R5_POLICY_DENIED", `R5 policy effect is ${effect}`);
  return Object.freeze({ decisionId: req(value.decisionId, "policy.decisionId"), effect, riskLevel: req(value.riskLevel || "R4", "policy.riskLevel") });
}
function attachmentsOf(value) {
  if (value == null) return [];
  if (!Array.isArray(value)) fail("R5_INVALID_ATTACHMENTS", "R5 attachments must be an array");
  return value.slice(0, 20).map((item, index) => {
    if (!item || typeof item !== "object") fail("R5_INVALID_ATTACHMENT", `R5 attachment ${index} must be an object`);
    const name = req(item.name || `annexo-${index + 1}`, "attachment.name");
    const mimeType = req(item.mimeType || "application/octet-stream", "attachment.mimeType");
    const size = Number.isFinite(Number(item.size)) ? Number(item.size) : null;
    return Object.freeze({ name, mimeType, size, digest: `sha256:${hash(JSON.stringify({ name, mimeType, size }))}` });
  });
}
function payloadOf(value) {
  if (!value || typeof value !== "object") fail("R5_INVALID_PROVIDER_RESPONSE", "R5 provider must return an object");
  if (value.mutated === true || value.execution === true) fail("R5_READ_ONLY_VIOLATION", "R5 provider reported mutation/execution");
  return Object.freeze({
    text: typeof value.text === "string" ? value.text : typeof value.body === "string" ? value.body : "",
    contentType: typeof value.contentType === "string" ? value.contentType.slice(0, 120) : "text/plain",
    attachments: attachmentsOf(value.attachments),
  });
}
function redactionOf(value, domain) {
  if (!value || typeof value !== "object") fail("R5_REDACTION_REQUIRED", "R5 redaction output is required");
  if (SENSITIVE.has(domain) && value.applied !== true) fail("R5_REDACTION_NOT_APPLIED", "R5 sensitive domains require applied redaction");
  return Object.freeze({
    text: typeof value.text === "string" ? value.text : "",
    applied: value.applied === true,
    redactions: Number.isInteger(value.redactions) && value.redactions >= 0 ? value.redactions : 0,
  });
}

export function createGovernedContentGateV2({ tenantId, authorize, evaluatePolicy, audit, redact, clock = () => new Date().toISOString(), maxTextBytes = 1024 * 1024 } = {}) {
  const boundTenantId = req(tenantId, "tenantId");
  for (const [name, fn] of Object.entries({ authorize, evaluatePolicy, audit, redact })) {
    if (typeof fn !== "function") fail("R5_MISSING_GATE_DEPENDENCY", `${name} function is required`);
  }
  if (!Number.isInteger(maxTextBytes) || maxTextBytes < 1 || maxTextBytes > 5 * 1024 * 1024) fail("R5_INVALID_MAX_BYTES", "maxTextBytes must be between 1 and 5 MiB");
  const resolvers = new Map();
  const log = async (event) => {
    try { await audit(freeze(event)); }
    catch (error) { fail("R5_AUDIT_FAILED", "R5 audit append failed", { cause: error?.code || error?.name || "unknown" }); }
  };

  function register(resolver) {
    if (!resolver || typeof resolver !== "object") fail("R5_INVALID_RESOLVER", "resolver must be an object");
    const id = req(resolver.id, "resolver.id");
    if (typeof resolver.fetch !== "function") fail("R5_INVALID_RESOLVER", `resolver ${id} must implement fetch(request)`);
    if (resolvers.has(id)) fail("R5_DUPLICATE_RESOLVER", `resolver already registered: ${id}`);
    resolvers.set(id, Object.freeze({ id, fetch: resolver.fetch }));
    return id;
  }

  async function fetch(request = {}) {
    const now = clock();
    const requestTenantId = req(request.tenantId, "request.tenantId");
    if (requestTenantId !== boundTenantId) fail("R5_TENANT_MISMATCH", "R5 cross-tenant fetch is blocked");
    const sourceId = req(request.sourceId, "request.sourceId");
    const objectId = req(request.objectId, "request.objectId");
    const domain = req(request.domain, "request.domain");
    if (!DOMAINS.has(domain)) fail("R5_INVALID_DOMAIN", `Unsupported domain: ${domain}`);
    const purposeOfUse = req(request.purposeOfUse, "request.purposeOfUse");
    const actor = actorOf(request.actor);
    const objectDigest = hash(`${sourceId}:${objectId}`);
    const resolver = resolvers.get(sourceId);
    if (!resolver) fail("R5_RESOLVER_NOT_FOUND", `No R5 resolver registered for source ${sourceId}`);

    let approval, authorization, policy;
    try {
      approval = approvalOf(request.approval, { tenantId: boundTenantId, sourceId, objectDigest, purposeOfUse, now });
      authorization = authorizationOf(await authorize(freeze({ tenantId: boundTenantId, actor, domain, sourceId, objectDigest, purposeOfUse, approval })));
      policy = policyOf(await evaluatePolicy(freeze({ tenantId: boundTenantId, actor, domain, sourceId, objectDigest, purposeOfUse, approval, authorization })));
    } catch (error) {
      await log({ event: "retrieval.content.denied", timestamp: now, tenantId: boundTenantId, domain, sourceId, objectDigest, purposeOfUse, actorDigest: hash(JSON.stringify(actor)), reason: error?.code || "R5_DENIED" });
      throw error;
    }

    await log({ event: "retrieval.content.authorized", timestamp: now, tenantId: boundTenantId, domain, sourceId, objectDigest, purposeOfUse, actorDigest: hash(JSON.stringify(actor)), approvalId: approval.approvalId, authorizationId: authorization.authorizationId, policyDecisionId: policy.decisionId, riskLevel: policy.riskLevel });

    const provider = payloadOf(await resolver.fetch(freeze({ tenantId: boundTenantId, domain, objectId, objectDigest, purposeOfUse, actor, approval, authorization, policy })));
    if (Buffer.byteLength(provider.text, "utf8") > maxTextBytes) fail("R5_CONTENT_TOO_LARGE", `R5 text exceeds ${maxTextBytes} bytes`);
    const redaction = redactionOf(await redact(freeze({ tenantId: boundTenantId, domain, sourceId, objectDigest, purposeOfUse, actor, text: provider.text, contentType: provider.contentType, attachments: provider.attachments })), domain);
    const contentDigest = hash(redaction.text);
    await log({ event: "retrieval.content.returned", timestamp: clock(), tenantId: boundTenantId, domain, sourceId, objectDigest, purposeOfUse, actorDigest: hash(JSON.stringify(actor)), approvalId: approval.approvalId, authorizationId: authorization.authorizationId, policyDecisionId: policy.decisionId, contentDigest: `sha256:${contentDigest}`, byteLength: Buffer.byteLength(redaction.text, "utf8"), redactions: redaction.redactions, attachmentCount: provider.attachments.length });

    return freeze({ tenantId: boundTenantId, domain, sourceId, objectDigest, purposeOfUse, contentType: provider.contentType, text: redaction.text, attachments: provider.attachments, redaction, provenance: { approvalId: approval.approvalId, authorizationId: authorization.authorizationId, policyDecisionId: policy.decisionId, contentDigest: `sha256:${contentDigest}` } });
  }

  return Object.freeze({ tenantId: boundTenantId, register, fetch, resolvers: () => [...resolvers.keys()] });
}

export const createGovernedContentGate = createGovernedContentGateV2;
export const __testV2 = Object.freeze({ hash, approvalOf, authorizationOf, policyOf, payloadOf });
