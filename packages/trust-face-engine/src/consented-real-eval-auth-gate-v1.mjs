
import { createHash } from "node:crypto";

export const TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1 = Object.freeze({
  version: "trust-face-consented-real-eval-auth-gate/v1",
  requiredScope: "face-1to1-evaluation",
  trainingAuthorizedByThisGate: false,
  realEvaluationAuthorizedByDefault: false,
  rawBiometricPayloadAccepted: false,
  rawEmbeddingAccepted: false,
  productionReady: false,
  biometricClaimReady: false,
});

function fail(code, message) {
  const error = new Error(message);
  error.name = "TrustFaceConsentedRealEvalAuthGateV1Error";
  error.code = code;
  throw error;
}

function required(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_authorization_field", `${field} is required`);
  return value.trim();
}

function requireSha256(value, field) {
  const normalized = required(value, field);
  if (!/^sha256:[0-9a-f]{64}$/i.test(normalized)) fail("invalid_digest", `${field} must be sha256:<64 hex>`);
  return normalized.toLowerCase();
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${createHash("sha256").update(stable(value)).digest("hex")}`;
}

function parseIso(value, field) {
  const normalized = required(value, field);
  const ms = Date.parse(normalized);
  if (!Number.isFinite(ms)) fail("invalid_authorization_time", `${field} must be ISO-8601`);
  return Object.freeze({ iso: new Date(ms).toISOString(), ms });
}

export function createConsentedRealEvaluationAuthorization({
  authorizationId,
  scope,
  protocolDigest,
  codeCommit,
  issuedAt,
  expiresAt,
  evaluationOnly = true,
  trainingAuthorized = false,
  realBiometricEvaluationAuthorized = false,
} = {}) {
  const normalizedAuthorizationId = required(authorizationId, "authorizationId");
  const normalizedScope = required(scope, "scope");
  if (normalizedScope !== TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.requiredScope) {
    fail("invalid_authorization_scope", `scope must be ${TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.requiredScope}`);
  }

  const normalizedProtocolDigest = requireSha256(protocolDigest, "protocolDigest");
  const normalizedCodeCommit = required(codeCommit, "codeCommit");

  if (evaluationOnly !== true) fail("evaluation_only_required", "evaluationOnly must be true");
  if (trainingAuthorized !== false) fail("training_authorization_forbidden", "this gate cannot authorize biometric training");
  if (realBiometricEvaluationAuthorized !== true) {
    fail("real_biometric_evaluation_not_authorized", "explicit real biometric evaluation authorization is required");
  }

  const issued = parseIso(issuedAt, "issuedAt");
  const expires = parseIso(expiresAt, "expiresAt");
  if (expires.ms <= issued.ms) fail("invalid_authorization_window", "expires must be after issuedAt");

  const body = Object.freeze({
    version: TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.version,
    authorizationId: normalizedAuthorizationId,
    scope: normalizedScope,
    protocolDigest: normalizedProtocolDigest,
    codeCommit: normalizedCodeCommit,
    issuedAt: issued.iso,
    expiresAt: expires.iso,
    evaluationOnly: true,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
  });

  return Object.freeze({
    ...body,
    authorizationDigest: sha256(body),
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}

export function assertConsentedRealEvaluationAuthorization({
  authorization,
  protocolDigest,
  codeCommit,
  now,
} = {}) {
  if (!authorization || typeof authorization !== "object") {
    fail("authorization_required", "authorization is required");
  }

  if (authorization.scope !== TRUST_FACE_CONSENTED_REAL_EVAL_AUTH_GATE_V1.requiredScope) {
    fail("authorization_scope_mismatch", "authorization scope mismatch");
  }
  if (authorization.evaluationOnly !== true || authorization.trainingAuthorized !== false) {
    fail("authorization_purpose_mismatch", "authorization must be evaluation-only and must not authorize training");
  }
  if (authorization.realBiometricEvaluationAuthorized !== true) {
    fail("real_biometric_evaluation_not_authorized", "real biometric evaluation authorization is not active");
  }

  const expectedProtocolDigest = requireSha256(protocolDigest, "protocolDigest");
  if (authorization.protocolDigest !== expectedProtocolDigest) {
    fail("protocol_digest_mismatch", "authorization protocolDigest does not match requested protocol");
  }
  const expectedCodeCommit = required(codeCommit, "codeCommit");
  if (authorization.codeCommit !== expectedCodeCommit) {
    fail("code_commit_mismatch", "authorization codeCommit does not match requested commit");
  }

  const current = parseIso(now, "now");
  const issued = parseIso(authorization.issuedAt, "authorization.issuedAt");
  const expires = parseIso(authorization.expiresAt, "authorization.expiresAt");
  if (current.ms < issued.ms || current.ms >= expires.ms) {
    fail("authorization_not_active", "authorization is outside its validity window");
  }

  return Object.freeze({
    authorized: true,
    authorizationId: authorization.authorizationId,
    authorizationDigest: authorization.authorizationDigest,
    scope: authorization.scope,
    protocolDigest: authorization.protocolDigest,
    codeCommit: authorization.codeCommit,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
    rawBiometricPayloadAccepted: false,
    rawEmbeddingAccepted: false,
    productionReady: false,
    biometricClaimReady: false,
  });
}
