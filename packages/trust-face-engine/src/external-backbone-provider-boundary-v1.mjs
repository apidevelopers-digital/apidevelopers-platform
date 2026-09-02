import { assertConsentedRealEvaluationAuthorization } from "./consented-real-eval-auth-gate-v1.mjs";

export const TRUST_FACE_EXTERNAL_BACKBONE_PROVIDER_BOUNDARY_V1 = Object.freeze({
  version: "trust-face-external-backbone-provider-boundary/v1",
  purpose: "invoke-authorized-external-embedding-provider-by-opaque-ref",
  mode: "candidate-external-provider-boundary",
  requiredEmbeddingDim: 512,
  rawBiometricPayloadAccepted: false,
  binaryPayloadAccepted: false,
  embeddingStored: false,
  providerAuthenticityVerified: false,
  externalIndependentValidationVerified: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceExternalBackboneProviderBoundaryV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceExternalBackboneProviderBoundaryV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceExternalBackboneProviderBoundaryV1Error(code, message);
};

const req = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    fail("invalid_external_provider_field", `${field} is required`);
  }
  return value.trim();
};

const digest = (value, field) => {
  const normalized = req(value, field).toLowerCase();
  if (!/^sha256:[0-9a-f]{64}$/.test(normalized)) {
    fail("invalid_external_provider_digest", `${field} must be sha256:<64 hex>`);
  }
  return normalized;
};

const forbidden = new Set([
  "image", "imageData", "rawImage", "pixels", "video", "videoData", "frames", "bytes", "buffer",
  "embedding", "embeddings", "vector", "vectors", "template", "biometricTemplate", "templatePayload",
  "ciphertext", "encryptedPayload", "payload", "privateKey", "keyMaterial", "kmsMaterial", "secret",
  "secretMaterial", "plaintext", "password", "token",
]);

function rejectRaw(value, seen = new Set()) {
  if (value == null || (typeof value !== "object" && typeof value !== "function")) return;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("external_provider_binary_payload_forbidden", "binary payload is forbidden");
  }
  if (seen.has(value)) {
    fail("external_provider_circular_input", "circular input is forbidden");
  }
  seen.add(value);
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.has(key)) {
      fail("external_provider_sensitive_payload_forbidden", `${key} is forbidden`);
    }
    rejectRaw(child, seen);
  }
  seen.delete(value);
}

function assertCheckpoint(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    fail("external_provider_checkpoint_required", "checkpoint manifest is required");
  }
  rejectRaw(manifest);

  if (manifest.version !== "trust-face-trained-checkpoint-manifest/v1") {
    fail("external_provider_checkpoint_version_mismatch", "trained checkpoint manifest v1 is required");
  }
  if (manifest.embeddingDim !== 512) {
    fail("external_provider_embedding_dim_mismatch", "checkpoint embeddingDim must be 512");
  }
  if (manifest.trainingCompleted !== true || manifest.evaluationCompleted !== true) {
    fail("external_provider_checkpoint_incomplete", "training and evaluation must be complete");
  }
  if (manifest.trainedBiometricWeightsIncluded !== true || manifest.biometricBackboneReady !== true) {
    fail("external_provider_trained_backbone_not_ready", "trained biometric backbone is not ready");
  }

  return Object.freeze({
    checkpointId: req(manifest.checkpointId, "checkpoint.checkpointId"),
    manifestDigest: digest(manifest.manifestDigest, "checkpoint.manifestDigest"),
    codeCommit: req(manifest.codeCommit, "checkpoint.codeCommit"),
    weightsDigest: digest(manifest.weightsDigest, "checkpoint.weightsDigest"),
    evaluationDigest: digest(manifest.evaluationDigest, "checkpoint.evaluationDigest"),
  });
}

function assertProvider(provider, checkpoint) {
  if (!provider || typeof provider !== "object" || Array.isArray(provider)) {
    fail("external_provider_required", "provider is required");
  }
  rejectRaw(provider);

  const providerId = req(provider.providerId, "provider.providerId");
  const weightsDigest = digest(provider.weightsDigest, "provider.weightsDigest");
  const evaluationDigest = digest(provider.evaluationDigest, "provider.evaluationDigest");

  if (weightsDigest !== checkpoint.weightsDigest) {
    fail("external_provider_weights_digest_mismatch", "provider weights digest does not match checkpoint");
  }
  if (evaluationDigest !== checkpoint.evaluationDigest) {
    fail("external_provider_evaluation_digest_mismatch", "provider evaluation digest does not match checkpoint");
  }
  if (provider.embeddingDim !== 512) {
    fail("external_provider_embedding_dim_mismatch", "provider embeddingDim must be 512");
  }
  if (typeof provider.inferByRef !== "function") {
    fail("external_provider_infer_method_required", "provider.inferByRef is required");
  }

  return Object.freeze({ providerId, weightsDigest, evaluationDigest, embeddingDim: 512 });
}

function assertSampleRef(value) {
  const normalized = req(value, "sampleRef");
  if (normalized.length > 256) {
    fail("external_provider_sample_ref_too_long", "sampleRef must be at most 256 characters");
  }
  if (/^(data:|base64:)/i.test(normalized)) {
    fail("external_provider_inline_payload_forbidden", "sampleRef must not contain inline payload data");
  }
  return normalized;
}

function assertEmbedding(value) {
  if (!Array.isArray(value) || value.length !== 512 || value.some((item) => !Number.isFinite(item))) {
    fail("external_provider_invalid_embedding", "provider must return a 512-dimensional finite embedding array");
  }
  return Object.freeze([...value]);
}

export function createExternalBackboneProviderBoundary({
  checkpointManifest,
  provider,
  protocolDigest,
} = {}) {
  const checkpoint = assertCheckpoint(checkpointManifest);
  const providerMeta = assertProvider(provider, checkpoint);
  const expectedProtocolDigest = digest(protocolDigest, "protocolDigest");

  return Object.freeze({
    version: TRUST_FACE_EXTERNAL_BACKBONE_PROVIDER_BOUNDARY_V1.version,
    purpose: TRUST_FACE_EXTERNAL_BACKBONE_PROVIDER_BOUNDARY_V1.purpose,
    mode: TRUST_FACE_EXTERNAL_BACKBONE_PROVIDER_BOUNDARY_V1.mode,
    providerId: providerMeta.providerId,
    checkpointId: checkpoint.checkpointId,
    checkpointManifestDigest: checkpoint.manifestDigest,
    weightsDigest: checkpoint.weightsDigest,
    evaluationDigest: checkpoint.evaluationDigest,
    embeddingDim: 512,
    rawBiometricPayloadAccepted: false,
    binaryPayloadAccepted: false,
    embeddingStored: false,
    providerAuthenticityVerified: false,
    externalIndependentValidationVerified: false,
    productionReady: false,
    biometricClaimReady: false,

    async inferByRef({ sampleRef, authorization, now } = {}) {
      rejectRaw({ authorization });
      const normalizedRef = assertSampleRef(sampleRef);

      const auth = assertConsentedRealEvaluationAuthorization({
        authorization,
        protocolDigest: expectedProtocolDigest,
        codeCommit: checkpoint.codeCommit,
        now,
      });

      const result = await provider.inferByRef(Object.freeze({
        sampleRef: normalizedRef,
        checkpointId: checkpoint.checkpointId,
        checkpointManifestDigest: checkpoint.manifestDigest,
        weightsDigest: checkpoint.weightsDigest,
        evaluationDigest: checkpoint.evaluationDigest,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
      }));

      return Object.freeze({
        providerId: providerMeta.providerId,
        checkpointId: checkpoint.checkpointId,
        checkpointManifestDigest: checkpoint.manifestDigest,
        authorizationId: auth.authorizationId,
        authorizationDigest: auth.authorizationDigest,
        embedding: assertEmbedding(result?.embedding),
        embeddingDim: 512,
        embeddingStored: false,
        providerAuthenticityVerified: false,
        externalIndependentValidationVerified: false,
        productionReady: false,
        biometricClaimReady: false,
      });
    },
  });
}
