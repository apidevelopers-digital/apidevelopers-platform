export const TRUST_BIOMETRIC_LOGIN_DECISION_V1 = Object.freeze({
  version: "trust-biometric-login-decision/v1",
  mode: "sandbox-conformance",
  modality: "face",
  productionEnabled: false,
  rawBiometricMaterialAccepted: false,
  sessionIssuanceEnabled: false,
  requiresFaceVerification: true,
  requiresLiveness: true,
  requiresAccessGrant: true,
  requiresEntitlement: true,
});

export class TrustBiometricLoginDecisionV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustBiometricLoginDecisionV1Error";
    this.code = code;
  }
}

const BAD_KEY = /(^|[_-])(raw|image|video|selfie|photo|template|embedding|biometric|ciphertext|privatekey|keymaterial|kmsmaterial|secret|password|token|cookie|sessionsecret)s?([_-]|$)/i;
const SAFE_CONTROL_KEYS = new Set([
  "rawBiometricMaterialForwarded",
  "rawBiometricMaterialPersisted",
  "rawBiometricMaterialAccepted",
]);

function forbiddenKey(key) {
  if (SAFE_CONTROL_KEYS.has(key)) return false;
  const normalized = String(key)
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .toLowerCase();
  return BAD_KEY.test(normalized);
}

function fail(code, message) {
  throw new TrustBiometricLoginDecisionV1Error(code, message);
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_input", `${field} is required`);
  return value.trim();
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_input", `${field} must be an object`);
  return value;
}

function scan(value, path = "$", seen = new Set()) {
  if (value === null || value === undefined) return;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("raw_biometric_material_forbidden", `binary material is forbidden at ${path}`);
  }
  if (typeof value !== "object") return;
  if (seen.has(value)) fail("circular_input_forbidden", `circular input is forbidden at ${path}`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`, seen));
    seen.delete(value);
    return;
  }
  for (const [key, nested] of Object.entries(value)) {
    if (forbiddenKey(key)) fail("raw_biometric_material_forbidden", `field ${path}.${key} is forbidden`);
    scan(nested, `${path}.${key}`, seen);
  }
  seen.delete(value);
}

function unit(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail("invalid_biometric_score", `${field} must be finite in [0,1]`);
  }
  return value;
}

function sha256(value, field) {
  const normalized = text(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_policy_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
}

function normalizeBiometricResult(result) {
  const value = record(result, "biometricResult");
  scan(value);
  const status = text(value.status, "biometricResult.status");
  if (!["completed", "review", "failed"].includes(status)) fail("invalid_biometric_status", "unsupported biometric result status");
  if (text(value.modality, "biometricResult.modality") !== "face") fail("unsupported_biometric_modality", "face modality is required");
  if (text(value.adapterMode, "biometricResult.adapterMode") !== "sandbox-conformance") {
    fail("production_not_authorized", "biometric adapter must remain sandbox-conformance");
  }
  if (value.productionAuthorized !== false) fail("production_not_authorized", "production biometric authorization is blocked");
  if (value.rawBiometricMaterialForwarded !== false || value.rawBiometricMaterialPersisted !== false) {
    fail("raw_biometric_material_forbidden", "raw biometric forwarding/persistence must remain false");
  }
  if (typeof value.livenessPerformed !== "boolean") fail("invalid_liveness_result", "livenessPerformed must be boolean");
  const signals = record(value.signals, "biometricResult.signals");
  const faceMatchScore = unit(signals.faceMatchScore, "biometricResult.signals.faceMatchScore");
  const livenessScore = unit(signals.livenessScore, "biometricResult.signals.livenessScore");
  if (typeof signals.livenessPassed !== "boolean") fail("invalid_liveness_result", "livenessPassed must be boolean");

  return Object.freeze({
    status,
    modality: "face",
    adapterMode: "sandbox-conformance",
    providerId: text(value.providerId, "biometricResult.providerId"),
    providerReference: text(value.providerReference, "biometricResult.providerReference"),
    livenessPerformed: value.livenessPerformed,
    signals: Object.freeze({
      faceMatchScore,
      livenessScore,
      livenessPassed: signals.livenessPassed,
    }),
    productionAuthorized: false,
    rawBiometricMaterialForwarded: false,
    rawBiometricMaterialPersisted: false,
  });
}

function normalizePolicyDecision(decision) {
  const value = record(decision, "biometricPolicyDecision");
  scan(value);
  if (typeof value.allowed !== "boolean") fail("invalid_biometric_policy_decision", "biometricPolicyDecision.allowed must be boolean");
  if (value.productionValidated !== false) {
    fail("production_policy_not_authorized", "biometric policy must remain explicitly non-production");
  }
  return Object.freeze({
    allowed: value.allowed,
    policyId: text(value.policyId, "biometricPolicyDecision.policyId"),
    policyDigest: sha256(value.policyDigest, "biometricPolicyDecision.policyDigest"),
    productionValidated: false,
    reason: value.reason == null ? null : text(value.reason, "biometricPolicyDecision.reason"),
  });
}

function normalizePrincipal(principal, tenantId) {
  if (principal == null) return null;
  const value = record(principal, "principal");
  scan(value);
  const id = text(value.id, "principal.id");
  const resolvedTenantId = text(value.tenantId, "principal.tenantId");
  if (resolvedTenantId !== tenantId) fail("principal_tenant_mismatch", "resolved principal tenant does not match biometric tenant");
  if (value.status && value.status !== "active") return null;
  const scopes = Object.freeze(
    [...new Set(Array.isArray(value.scopes) ? value.scopes.map((scope) => text(scope, "principal.scope")) : [])].sort(),
  );
  return Object.freeze({
    id,
    tenantId,
    ...(value.name ? { name: text(value.name, "principal.name") } : {}),
    status: "active",
    scopes,
    authenticationMethod: "trust_biometric_face_sandbox",
  });
}

function denied(reason, stage, context = {}) {
  return Object.freeze({
    version: TRUST_BIOMETRIC_LOGIN_DECISION_V1.version,
    mode: TRUST_BIOMETRIC_LOGIN_DECISION_V1.mode,
    status: "denied",
    reason: reason,
    stage,
    ...context,
    session: Object.freeze({ issuanceAllowed: false, issued: false }),
    productionAuthorized: false,
    productionReady: false,
  });
}

export function createTrustBiometricLoginDecision({
  biometricAdapter,
  evaluateBiometricPolicy,
  resolvePrincipalBySubjectRef,
  accessRuntime,
} = {}) {
  if (!biometricAdapter || typeof biometricAdapter.verifyFaceLiveness !== "function") {
    throw new TypeError("biometricAdapter.verifyFaceLiveness must be a function");
  }
  if (typeof evaluateBiometricPolicy !== "function") throw new TypeError("evaluateBiometricPolicy must be a function");
  if (typeof resolvePrincipalBySubjectRef !== "function") throw new TypeError("resolvePrincipalBySubjectRef must be a function");
  if (
    !accessRuntime ||
    typeof accessRuntime.resolveActiveGrant !== "function" ||
    typeof accessRuntime.evaluateAccess !== "function"
  ) {
    throw new TypeError("accessRuntime.resolveActiveGrant and accessRuntime.evaluateAccess must be functions");
  }

  return Object.freeze({
    profile: TRUST_BIOMETRIC_LOGIN_DECISION_V1,

    async login({ biometricRequest, workspaceId, productId } = {}) {
      const request = record(biometricRequest, "biometricRequest");
      scan(request);
      if (request.environment !== "sandbox") fail("production_not_authorized", "sandbox biometric requests only");

      const tenantId = text(request.tenantId, "biometricRequest.tenantId");
      const verificationId = text(request.verificationId, "biometricRequest.verificationId");
      const subjectRef = text(request.subjectRef, "biometricRequest.subjectRef");
      const normalizedWorkspaceId = text(workspaceId, "workspaceId");
      const normalizedProductId = text(productId, "productId");

      const biometricResult = normalizeBiometricResult(await biometricAdapter.verifyFaceLiveness(request));

      if (biometricResult.status !== "completed") {
        return denied("biometric_status_not_completed", "biometric", { verificationId, tenantId });
      }
      if (!biometricResult.livenessPerformed || !biometricResult.signals.livenessPassed) {
        return denied("biometric_liveness_not_passed", "biometric", { verificationId, tenantId });
      }

      const policyDecision = normalizePolicyDecision(
        await evaluateBiometricPolicy({
          biometricResult,
          context: Object.freeze({
            tenantId,
            workspaceId: normalizedWorkspaceId,
            productId: normalizedProductId,
            verificationId,
            subjectRef,
          }),
        }),
      );

      if (!policyDecision.allowed) {
        return denied(policyDecision.reason || "biometric_policy_denied", "biometric_policy", {
          verificationId,
          tenantId,
          policyId: policyDecision.policyId,
          policyDigest: policyDecision.policyDigest,
        });
      }

      const principal = normalizePrincipal(
        await resolvePrincipalBySubjectRef({ tenantId, subjectRef }),
        tenantId,
      );
      if (!principal) {
        return denied("biometric_principal_not_resolved", "principal", {
          verificationId,
          tenantId,
          policyId: policyDecision.policyId,
          policyDigest: policyDecision.policyDigest,
        });
      }

      const identity = Object.freeze({ role: "client", principal });

      const grantResolution = record(
        await accessRuntime.resolveActiveGrant({
          tenantId,
          principalId: principal.id,
          productId: normalizedProductId,
        }),
        "grantResolution",
      );
      scan(grantResolution);

      if (grantResolution.resolved !== true || !grantResolution.grant) {
        return denied(
          grantResolution.reason ? text(grantResolution.reason, "grantResolution.reason") : "access_grant_not_resolved",
          "grant",
          {
            verificationId,
            tenantId,
            principalId: principal.id,
            policyId: policyDecision.policyId,
            policyDigest: policyDecision.policyDigest,
          },
        );
      }

      const accessGrantId = text(grantResolution.grant.accessGrantId, "grantResolution.grant.accessGrantId");
      const accessDecision = record(
        await accessRuntime.evaluateAccess({\n          identity,\n          accessGrantId,\n          tenantId,\n          workspaceId: normalizedWorkspaceId,\n          productId: normalizedProductId,\n        }),
        "accessDecision",
      );
      scan(accessDecision);

      if (accessDecision.allowed !== true) {
        return denied(
          accessDecision.reason ? text(accessDecision.reason, "accessDecision.reason") : "saas_access_denied",
          "access",
          {
            verificationId,
            tenantId,
            principalId: principal.id,
            accessGrantId,
            policyId: policyDecision.policyId,
            policyDigest: policyDecision.policyDigest,
          },
        );
      }

      return Object.freeze({
        version: TRUST_BIOMETRIC_LOGIN_DECISION_V1.version,
        mode: TRUST_BIOMETRIC_LOGIN_DECISION_V1.mode,
        status: "authorized",
        authentication: Object.freeze({
          method: "trust_biometric_face_sandbox",
          modality: "face",
          verificationId,
          providerId: biometricResult.providerId,
          providerReference: biometricResult.providerReference,
          policyId: policyDecision.policyId,
          policyDigest: policyDecision.policyDigest,
          policyProductionValidated: false,
        }),
        identity,
        access: Object.freeze({
          allowed: true,
          tenantId,
          workspaceId: normalizedWorkspaceId,
          productId: normalizedProductId,
          accessGrantId,
        }),
        session: Object.freeze({
          issuanceAllowed: false,
          issued: false,
          nextStage: "auth-core-session-issuance",
        }),
        rawBiometricMaterialForwarded: false,
        rawBiometricMaterialPersisted: false,
        productionAuthorized: false,
        productionReady: false,
      });
    },
  });
}
