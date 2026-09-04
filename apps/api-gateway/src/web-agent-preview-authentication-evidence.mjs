import { randomUUID } from "node:crypto";

import {
  assertAuthenticationContextContract,
  assertAuthorizationDecisionContract,
  createAuthenticationContext,
  createAuthorizationDecision,
} from "@apidevelopers/contracts";

export const uniCoPreviewAuthenticationEvidenceCollection =
  "web.authenticationEvidence";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function requireSafeId(value, name) {
  const normalized = requireText(value, name);
  if (!SAFE_ID.test(normalized) || normalized.includes("@")) {
    throw new TypeError(`${name} must be an opaque safe identifier`);
  }
  return normalized;
}

function requireIso(value, name) {
  const normalized = requireText(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    throw new TypeError(`${name} must be ISO-8601`);
  }
  return normalized;
}

export function createUniCoPreviewAuthenticationEvidence({
  principalId,
  tenantId,
  authenticatedAt,
  expiresAt,
  idFactory = randomUUID,
} = {}) {
  principalId = requireSafeId(principalId, "principalId");
  tenantId = requireSafeId(tenantId, "tenantId");
  authenticatedAt = requireIso(authenticatedAt, "authenticatedAt");
  expiresAt = requireIso(expiresAt, "expiresAt");
  if (Date.parse(expiresAt) <= Date.parse(authenticatedAt)) {
    throw new RangeError("expiresAt must be after authenticatedAt");
  }
  if (typeof idFactory !== "function") {
    throw new TypeError("idFactory must be a function");
  }

  const nextId = (prefix) =>
    requireSafeId(`${prefix}.${requireText(idFactory(), "generated id")}`, prefix);

  const authenticationContext = createAuthenticationContext({
    authenticationId: nextId("auth"),
    subjectId: principalId,
    tenantId,
    methods: ["password"],
    assuranceLevel: "aal1",
    authenticatedAt,
    expiresAt,
  });
  assertAuthenticationContextContract(authenticationContext);

  const policyDecision = createAuthorizationDecision({
    decisionId: nextId("decision"),
    subjectId: principalId,
    tenantId,
    action: "browser_session:issue",
    resource: "product:uni-co",
    effect: "allow",
    policyVersion: "uni-co-preview-login/v1",
    reasonCodes: ["credential_verified", "active_access_grant"],
    humanApprovalRequired: false,
    decidedAt: authenticatedAt,
  });
  assertAuthorizationDecisionContract(policyDecision);

  return Object.freeze({
    evidenceId: nextId("auth-evidence"),
    status: "active",
    principalId,
    tenantId,
    correlationId: nextId("corr"),
    authenticationContext,
    policyDecision,
    createdAt: authenticatedAt,
    expiresAt,
    secretMaterialIncluded: false,
  });
}

export function createUniCoPreviewAuthenticationEvidenceResolver({
  store,
  clock = () => new Date(),
} = {}) {
  if (!store || typeof store.read !== "function") {
    throw new TypeError("store.read is required");
  }
  if (typeof clock !== "function") {
    throw new TypeError("clock must be a function");
  }

  return Object.freeze({
    async resolveActive({ principalId, tenantId } = {}) {
      principalId = requireSafeId(principalId, "principalId");
      tenantId = requireSafeId(tenantId, "tenantId");
      const current = clock();
      const now = current instanceof Date ? current : new Date(current);
      if (Number.isNaN(now.getTime())) throw new TypeError("clock must return a valid date");

      const state = await store.read();
      const collection =
        state?.collections?.[uniCoPreviewAuthenticationEvidenceCollection] ?? {};
      const matches = Object.values(collection).filter((record) =>
        record &&
        record.status === "active" &&
        record.principalId === principalId &&
        record.tenantId === tenantId &&
        typeof record.expiresAt === "string" &&
        Date.parse(record.expiresAt) > now.getTime()
      );

      if (matches.length === 0) {
        return Object.freeze({
          resolved: false,
          reason: "authentication_evidence_not_found",
          evidence: null,
        });
      }
      if (matches.length !== 1) {
        return Object.freeze({
          resolved: false,
          reason: "authentication_evidence_ambiguous",
          evidence: null,
        });
      }

      const evidence = structuredClone(matches[0]);
      assertAuthenticationContextContract(evidence.authenticationContext);
      assertAuthorizationDecisionContract(evidence.policyDecision);
      if (
        evidence.secretMaterialIncluded !== false ||
        evidence.authenticationContext.subjectId !== principalId ||
        evidence.authenticationContext.tenantId !== tenantId ||
        evidence.policyDecision.subjectId !== principalId ||
        evidence.policyDecision.tenantId !== tenantId ||
        evidence.policyDecision.effect !== "allow"
      ) {
        return Object.freeze({
          resolved: false,
          reason: "authentication_evidence_binding_mismatch",
          evidence: null,
        });
      }

      return Object.freeze({
        resolved: true,
        reason: null,
        evidence: Object.freeze(evidence),
      });
    },
  });
}
