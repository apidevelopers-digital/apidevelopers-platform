import assert from "node:assert/strict";
import test from "node:test";
import {
  createConsentedRealEvaluationAuthorization,
} from "../src/consented-real-eval-auth-gate-v1.mjs";
import {
  TRUST_FACE_EXTERNAL_BACKBONE_PROVIDER_BOUNDARY_V1 as PROFILE,
  createExternalBackboneProviderBoundary,
} from "../src/external-backbone-provider-boundary-v1.mjs";

const D = (char) => `sha256:${char.repeat(64)}`;

const checkpoint = (overrides = {}) => ({
  version: "trust-face-trained-checkpoint-manifest/v1",
  checkpointId: "checkpoint-001",
  codeCommit: "abc123",
  embeddingDim: 512,
  trainingCompleted: true,
  evaluationCompleted: true,
  weightsDigest: D("3"),
  evaluationDigest: D("4"),
  trainedBiometricWeightsIncluded: true,
  biometricBackboneReady: true,
  manifestDigest: D("5"),
  productionReady: false,
  biometricClaimReady: false,
  ...overrides,
});

const authorization = (overrides = {}) =>
  createConsentedRealEvaluationAuthorization({
    authorizationId: "evaluation-auth-001",
    scope: "face-1to1-evaluation",
    protocolDigest: D("7"),
    codeCommit: "abc123",
    issuedAt: "2026-09-02T15:00:00Z",
    expiresAt: "2026-09-02T17:00:00Z",
    evaluationOnly: true,
    trainingAuthorized: false,
    realBiometricEvaluationAuthorized: true,
    ...overrides,
  });

function provider(overrides = {}) {
  return {
    providerId: "provider-001",
    weightsDigest: D("3"),
    evaluationDigest: D("4"),
    embeddingDim: 512,
    calls: 0,
    async inferByRef() {
      this.calls += 1;
      return { embedding: Array.from({ length: 512 }, () => 1 / Math.sqrt(512)) };
    },
    ...overrides,
  };
}

test("profile remains candidate-only and non-production", () => {
  assert.equal(PROFILE.requiredEmbeddingDim, 512);
  for (const field of [
    "rawBiometricPayloadAccepted",
    "binaryPayloadAccepted",
    "embeddingStored",
    "providerAuthenticityVerified",
    "externalIndependentValidationVerified",
    "productionReady",
    "biometricClaimReady",
  ]) {
    assert.equal(PROFILE[field], false);
  }
});

test("untrained checkpoint is rejected before provider execution", () => {
  const injected = provider();
  assert.throws(
    () =>
      createExternalBackboneProviderBoundary({
        checkpointManifest: checkpoint({
          trainedBiometricWeightsIncluded: false,
          biometricBackboneReady: false,
        }),
        provider: injected,
        protocolDigest: D("7"),
      }),
    (error) => error.code === "external_provider_trained_backbone_not_ready",
  );
  assert.equal(injected.calls, 0);
});

test("provider digest mismatch fails closed", () => {
  assert.throws(
    () =>
      createExternalBackboneProviderBoundary({
        checkpointManifest: checkpoint(),
        provider: provider({ weightsDigest: D("9") }),
        protocolDigest: D("7"),
      }),
    (error) => error.code === "external_provider_weights_digest_mismatch",
  );
});

test("sensitive provider configuration is rejected", () => {
  const injected = provider({ privateKey: "forbidden" });
  assert.throws(
    () =>
      createExternalBackboneProviderBoundary({
        checkpointManifest: checkpoint(),
        provider: injected,
        protocolDigest: D("7"),
      }),
    (error) => error.code === "external_provider_sensitive_payload_forbidden",
  );
  assert.equal(injected.calls, 0);
});

test("expired authorization fails before provider invocation", async () => {
  const injected = provider();
  const boundary = createExternalBackboneProviderBoundary({
    checkpointManifest: checkpoint(),
    provider: injected,
    protocolDigest: D("7"),
  });

  await assert.rejects(
    () =>
      boundary.inferByRef({
        sampleRef: "sample://001",
        authorization: authorization({ expiresAt: "2026-09-02T15:30:00Z" }),
        now: "2026-09-02T16:00:00Z",
      }),
    (error) => error.code === "authorization_not_active",
  );
  assert.equal(injected.calls, 0);
});

test("authorized opaque reference returns an ephemeral embedding", async () => {
  const injected = provider();
  const boundary = createExternalBackboneProviderBoundary({
    checkpointManifest: checkpoint(),
    provider: injected,
    protocolDigest: D("7"),
  });

  const result = await boundary.inferByRef({
    sampleRef: "sample://001",
    authorization: authorization(),
    now: "2026-09-02T16:00:00Z",
  });

  assert.equal(injected.calls, 1);
  assert.equal(result.embedding.length, 512);
  assert.equal(result.embeddingStored, false);
  assert.equal(result.providerAuthenticityVerified, false);
  assert.equal(result.externalIndependentValidationVerified, false);
  assert.equal(result.productionReady, false);
  assert.equal(result.biometricClaimReady, false);
});

test("invalid provider embedding fails closed", async () => {
  const boundary = createExternalBackboneProviderBoundary({
    checkpointManifest: checkpoint(),
    provider: provider({ async inferByRef() { return { embedding: [1, 2, 3] }; } }),
    protocolDigest: D("7"),
  });

  await assert.rejects(
    () =>
      boundary.inferByRef({
        sampleRef: "sample://001",
        authorization: authorization(),
        now: "2026-09-02T16:00:00Z",
      }),
    (error) => error.code === "external_provider_invalid_embedding",
  );
});

test("inline and raw payloads are rejected before provider invocation", async () => {
  const injected = provider();
  const boundary = createExternalBackboneProviderBoundary({
    checkpointManifest: checkpoint(),
    provider: injected,
    protocolDigest: D("7"),
  });

  await assert.rejects(
    () =>
      boundary.inferByRef({
        sampleRef: "data:image/png;base64,abc",
        authorization: authorization(),
        now: "2026-09-02T16:00:00Z",
      }),
    (error) => error.code === "external_provider_inline_payload_forbidden",
  );

  await assert.rejects(
    () =>
      boundary.inferByRef({
        sampleRef: "sample://001",
        authorization: { ...authorization(), rawImage: "forbidden" },
        now: "2026-09-02T16:00:00Z",
      }),
    (error) => error.code === "external_provider_sensitive_payload_forbidden",
  );

  assert.equal(injected.calls, 0);
});

test("boundary exposes no production management surface", () => {
  const boundary = createExternalBackboneProviderBoundary({
    checkpointManifest: checkpoint(),
    provider: provider(),
    protocolDigest: D("7"),
  });

  for (const field of [
    "deploy",
    "publish",
    "storePrivateKey",
    "getPrivateKey",
    "writeVault",
    "deleteTemplate",
    "sign",
    "loadModelWeights",
  ]) {
    assert.equal(boundary[field], undefined);
  }
});
