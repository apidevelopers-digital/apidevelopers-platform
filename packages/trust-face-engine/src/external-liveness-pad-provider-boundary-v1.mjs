import { assertConsentedRealEvaluationAuthorization } from "./consented-real-eval-auth-gate-v1.mjs";

export const TRUST_FACE_EXTERNAL_LIVENESS_PAD_PROVIDER_BOUNDARY_V1 = Object.freeze({
  version: "trust-face-external-liveness-pad-provider-boundary/v1",
  purpose: "invoke-authorized-external-liveness-pad-provider-by-opaque-ref",
  mode: "candidate-external-provider-boundary",
  rawImagePayloadAccepted: false,
  rawVideoPayloadAccepted: false,
  binaryPayloadAccepted: false,
  providerResultStored: false,
  activeChallengeExecutedByBoundary: false,
  originAttestedByBoundary: false,
  providerAuthenticityVerified: false,
  externalIndependentValidationVerified: false,
  realPadReady: false,
  benchmarkReady: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceExternalLivenessPadProviderBoundaryV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceExternalLivenessPadProviderBoundaryV1Error";
    this.code = code;
  }
}
const fail = (code, message) => { throw new TrustFaceExternalLivenessPadProviderBoundaryV1Error(code, message); };
const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) fail("invalid_external_pad_provider_field", `${field} is required`);
  return value.trim();
};
const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) fail("invalid_external_pad_provider_digest", `${field} must be sha256:<64 hex>`);
  return normalized;
};
const forbidden = new Set([
  "image","imageData","rawImage","pixels","video","videoData","rawVideo","frames","frameData","bytes","buffer","base64",
  "embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload","ciphertext","encryptedPayload",
  "payload","privateKey","publicKey","keyMaterial","kmsMaterial","secret","secretMaterial","plaintext","password","token"
]);
function rejectSensitive(value, seen = new Set()) {
  if (value == null || (typeof value !== "object" && typeof value !== "function")) return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) fail("external_pad_provider_binary_payload_forbidden", "binary payload is forbidden");
  if (seen.has(value)) fail("external_pad_provider_circular_input", "circular input is forbidden");
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) fail("external_pad_provider_sensitive_payload_forbidden", `${key} is forbidden`);
    rejectSensitive(child, seen);
  }
  seen.delete(value);
}
function assertProvider(provider) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) fail("external_pad_provider_required", "provider is required");
  rejectSensitive(provider);
  const inputModality = req(provider.inputModality, "provider.inputModality");
  if (!["image","video"].includes(inputModality)) fail("external_pad_provider_invalid_modality", "provider.inputModality must be image or video");
  if (typeof provider.evaluateByRef !== "function") fail("external_pad_provider_evaluate_method_required", "provider.evaluateByRef is required");
  return Object.freeze({
    providerId: req(provider.providerId, "provider.providerId"),
    providerVersion: req(provider.providerVersion, "provider.providerVersion"),
    codeCommit: req(provider.codeCommit, "provider.codeCommit"),
    modelDigest: digest(provider.modelDigest, "provider.modelDigest"),
    evaluationDigest: digest(provider.evaluationDigest, "provider.evaluationDigest"),
    inputModality,
  });
}
function assertSampleRef(value) {
  const normalized = req(value, "sampleRef");
  if (normalized.length > 256) fail("external_pad_provider_sample_ref_too_long", "sampleRef must be at most 256 characters");
  if (/^(data:|base64:)/i.test(normalized)) fail("external_pad_provider_inline_payload_forbidden", "sampleRef must not contain inline payload data");
  return normalized;
}
function unit(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail("external_pad_provider_invalid_score", `${field} must be finite in [0,1]`);
  return value;
}
function assertProviderResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) fail("external_pad_provider_invalid_result", "provider result is required");
  rejectSensitive(result);
  if (typeof result.presentationAttackDetected !== "boolean") fail("external_pad_provider_invalid_result", "presentationAttackDetected must be boolean");
  return Object.freeze({
    presentationAttackDetected: result.presentationAttackDetected,
    padScore: unit(result.padScore, "padScore"),
    livenessScore: unit(result.livenessScore, "livenessScore"),
  });
}
export function createExternalLivenessPadProviderBoundary({ provider, protocolDigest } = {}) {
  const providerMeta = assertProvider(provider);
  const expectedProtocolDigest = digest(protocolDigest, "protocolDigest");
  return Object.freeze({
    version: TRUST_FACE_EXTERNAL_LIVENESS_PAD_PROVIDER_BOUNDARY_V1.version,
    purpose: TRUST_FACE_EXTERNAL_LIVENESS_PAD_PROVIDER_BOUNDARY_V1.purpose,
    mode: TRUST_FACE_EXTERNAL_LIVENESS_PAD_PROVIDER_BOUNDARY_V1.mode,
    providerId: providerMeta.providerId,
    providerVersion: providerMeta.providerVersion,
    codeCommit: providerMeta.codeCommit,
    modelDigest: providerMeta.modelDigest,
    evaluationDigest: providerMeta.evaluationDigest,
    inputModality: providerMeta.inputModality,
    rawImagePayloadAccepted: false,
    rawVideoPayloadAccepted: false,
    binaryPayloadAccepted: false,
    providerResultStored: false,
    activeChallengeExecutedByBoundary: false,
    originAttestedByBoundary: false,
    providerAuthenticityVerified: false,
    externalIndependentValidationVerified: false,
    realPadReady: false,
    benchmarkReady: false,
    productionReady: false,
    biometricClaimReady: false,
    async evaluateByRef({ sampleRef, authorization, now } = {}) {
      rejectSensitive({ authorization });
      const normalizedRef = assertSampleRef(sampleRef);
      const auth = assertConsentedRealEvaluationAuthorization({
        authorization,
        protocolDigest: expectedProtocolDigest,
        codeCommit: providerMeta.codeCommit,
        now,
      });
      const rawResult = await provider.evaluateByRef(Object.freeze({
        sampleRef: normalizedRef,
        providerId: providerMeta.providerId,
        providerVersion: providerMeta.providerVersion,
        modelDigest: providerMeta.modelDigest,
        evaluationDigest: providerMeta.evaluationDigest,
        inputModality: providerMeta.inputModality,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
      }));
      const result = assertProviderResult(rawResult);
      return Object.freeze({
        providerId: providerMeta.providerId,
        providerVersion: providerMeta.providerVersion,
        modelDigest: providerMeta.modelDigest,
        evaluationDigest: providerMeta.evaluationDigest,
        inputModality: providerMeta.inputModality,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
        ...result,
        providerResultStored: false,
        activeChallengeExecutedByBoundary: false,
        originAttestedByBoundary: false,
        providerAuthenticityVerified: false,
        externalIndependentValidationVerified: false,
        realPadReady: false,
        benchmarkReady: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },
  });
}
