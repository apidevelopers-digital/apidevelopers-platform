import { randomUUID } from "node:crypto";

import { authorize } from "@apidevelopers/auth-core";
import {
  createTenantContext,
  TRUST_SANDBOX_AUDIT_READ_CONTRACT,
  TRUST_SANDBOX_EVIDENCE_READ_CONTRACT,
  TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT,
} from "@apidevelopers/contracts";
import { createDurableRepository } from "@apidevelopers/persistence-core";
import { runTrustGovernancePreview } from "@apidevelopers/trust-governance-runtime";

const reply = (status, payload) =>
  Object.freeze({
    status,
    headers: Object.freeze({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    }),
    body: JSON.stringify(payload),
  });

function tenantIdOf(actor) {
  const tenantId = String(actor?.principal?.tenantId ?? "").trim();
  return tenantId || null;
}

function principalIdOf(actor) {
  const principalId = String(actor?.principal?.id ?? "").trim();
  return principalId || null;
}

function readSinglePathId(pathname, prefix) {
  if (!pathname.startsWith(prefix)) return null;
  const raw = pathname.slice(prefix.length);
  if (!raw || raw.includes("/")) return null;
  try {
    const id = decodeURIComponent(raw).trim();
    return id || null;
  } catch {
    return null;
  }
}

function readGovernanceVerificationId(pathname) {
  const { pathPrefix, pathSuffix } = TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT;
  if (!pathname.startsWith(pathPrefix) || !pathname.endsWith(pathSuffix)) return null;
  const raw = pathname.slice(pathPrefix.length, -pathSuffix.length);
  if (!raw || raw.includes("/")) return null;
  try {
    const id = decodeURIComponent(raw).trim();
    return id || null;
  } catch {
    return null;
  }
}

function hasScope(actor, requiredScope) {
  return authorize(actor, { scopes: [requiredScope] }).allowed;
}

export function createTrustSandboxGovernanceApp({
  authenticator,
  verificationRepository,
  store,
  clock = () => new Date().toISOString(),
  idFactory = randomUUID,
  requestIdFactory = randomUUID,
} = {}) {
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate_function_required");
  }
  if (typeof verificationRepository?.getById !== "function") {
    throw new TypeError("verificationRepository.getById_function_required");
  }
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store_read_transaction_required");
  }
  if (typeof clock !== "function") throw new TypeError("clock_function_required");
  if (typeof idFactory !== "function") throw new TypeError("idFactory_function_required");
  if (typeof requestIdFactory !== "function") throw new TypeError("requestIdFactory_function_required");

  const repository = createDurableRepository({
    store,
    collection: "trust_governance_previews",
    idField: "roundTripId",
  });

  async function authenticate(headers) {
    const actor = await authenticator.authenticate(headers ?? {});
    if (!actor) return { error: reply(401, { ok: false, reason: "unauthorized" }) };

    const tenantId = tenantIdOf(actor);
    const principalId = principalIdOf(actor);
    if (!tenantId || !principalId) {
      return {
        error: reply(403, { ok: false, reason: "tenant_context_required" }),
      };
    }
    return { actor, tenantId, principalId };
  }

  async function createPreview(request, verificationId) {
    const authn = await authenticate(request.headers);
    if (authn.error) return authn.error;
    if (!hasScope(authn.actor, TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT.requiredScope)) {
      return reply(403, { ok: false, reason: "governance_preview_scope_forbidden" });
    }

    const verification = await verificationRepository.getById(verificationId);
    if (!verification || verification.tenantId !== authn.tenantId) {
      return reply(404, { ok: false, reason: "verification_not_found" });
    }

    const createdAt = clock();
    const requestId = `request.trust-governance.${requestIdFactory()}`;
    const tenantContext = createTenantContext({
      tenantId: authn.tenantId,
      principalId: authn.principalId,
      requestId,
      roles: [authn.actor.role],
      permissions: Array.isArray(authn.actor.principal?.scopes) ? [...authn.actor.principal.scopes] : [],
      createdAt,
    });

    try {
      const governance = await runTrustGovernancePreview({
        verification,
        tenantContext,
        clock,
        idFactory,
      });

      const record = Object.freeze({
        roundTripId: governance.roundTripId,
        tenantId: authn.tenantId,
        verificationId,
        evidenceId: governance.evidenceRecord.evidenceId,
        auditId: governance.auditReport.auditId,
        environment: "sandbox",
        mode: "preview",
        executionObserved: false,
        mutationObserved: false,
        governance,
        createdAt,
      });

      const persisted = await repository.create(record);
      return reply(201, { ok: true, governancePreview: persisted });
    } catch {
      return reply(409, { ok: false, reason: "trust_governance_preview_failed" });
    }
  }

  async function readNested(request, id, kind) {
    const authn = await authenticate(request.headers);
    if (authn.error) return authn.error;

    const contract = kind === "evidence" ? TRUST_SANDBOX_EVIDENCE_READ_CONTRACT : TRUST_SANDBOX_AUDIT_READ_CONTRACT;
    if (!hasScope(authn.actor, contract.requiredScope)) {
      return reply(403, { ok: false, reason: `${kind}_read_scope_forbidden` });
    }

    const records = await repository.list({ where: { tenantId: authn.tenantId } });
    const match = records.find((record) => kind === "evidence" ? record.evidenceId === id : record.auditId === id);
    if (!match) {
      return reply(404, { ok: false, reason: `${kind}_not_found` });
    }

    return reply(200, {
      ok: true,
      [kind]: kind === "evidence" ? match.governance.evidenceRecord : match.governance.auditReport,
    });
  }

  return Object.freeze({
    repository,
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(String(request.url ?? "/"), "http://gateway.local").pathname;

      const governanceVerificationId = readGovernanceVerificationId(pathname);
      if (method === TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT.method && governanceVerificationId) {
        return createPreview(request, governanceVerificationId);
      }

      const evidenceId = readSinglePathId(pathname, TRUST_SANDBOX_EVIDENCE_READ_CONTRACT.pathPrefix);
      if (method === TRUST_SANDBOX_EVIDENCE_READ_CONTRACT.method && evidenceId) {
        return readNested(request, evidenceId, "evidence");
      }

      const auditId = readSinglePathId(pathname, TRUST_SANDBOX_AUDIT_READ_CONTRACT.pathPrefix);
      if (method === TRUST_SANDBOX_AUDIT_READ_CONTRACT.method && auditId) {
        return readNested(request, auditId, "audit");
      }

      return null;
    },
  });
}
