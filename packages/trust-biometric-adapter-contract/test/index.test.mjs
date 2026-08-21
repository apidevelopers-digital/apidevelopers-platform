import test from "node:test";
import assert from "node:assert/strict";
import {
  TRUST_BIOMETRIC_ADAPTER_CONTRACT,
  TrustBiometricAdapterContractError,
  assertTrustBiometricAdapterManifest,
  assertTrustFaceLivenessRequest,
  createTrustBiometricAdapterPreflight,
  normalizeTrustFaceLivenessResult,
} from "../src/index.mjs";

const manifest = (overrides = {}) => ({
  contractVersion: "trust-biometric-adapter/v1",
  providerId: "provider.pending-authorization",
  mode: "sandbox-conformance",
  productionEnabled: false,
  capabilities: { faceVerification: true, liveness: true },
  dataHandling: { rawBiometricPersistence: false, rawBiometricLogging: false, providerReference: true },
  ...overrides,
});

const request = (overrides = {}) => ({
  environment: "sandbox",
  tenantId: "tenant.sandbox.alpha",
  verificationId: "verification.sandbox.001",
  subjectRef: "subject.sha256.0123456789abcdef",
  providerSessionRef: "provider-session.ref.001",
  consentRef: "consent.ref.001",
  ...overrides,
});

const result = (overrides = {}) => ({
  status: "completed",
  providerReference: "provider.result.ref.001",
  faceMatchScore: 0.93,
  livenessScore: 0.97,
  livenessPassed: true,
  reasonCodes: ["sandbox_conformance_pass"],
  ...overrides,
});

test("declares sandbox-only provider-neutral M4 contract", () => {
  assert.equal(TRUST_BIOMETRIC_ADAPTER_CONTRACT.mode, "sandbox-conformance");
  assert.equal(TRUST_BIOMETRIC_ADAPTER_CONTRACT.productionEnabled, false);
  assert.equal(TRUST_BIOMETRIC_ADAPTER_CONTRACT.rawBiometricPersistenceAllowed, false);
});

test("fails closed on provider activation and production", () => {
  assert.throws(
    () => assertTrustBiometricAdapterManifest(manifest({ mode: "provider-live" })),
    (e) => e instanceof TrustBiometricAdapterContractError && e.code === "provider_not_authorized",
  );
  assert.throws(
    () => assertTrustFaceLivenessRequest(request({ environment: "production" })),
    (e) => e instanceof TrustBiometricAdapterContractError && e.code === "production_not_authorized",
  );
});

test("rejects explicitly identified raw biometric material", () => {
  assert.throws(
    () => assertTrustFaceLivenessRequest(request({ selfie: "base64-material" })),
    (e) => e instanceof TrustBiometricAdapterContractError && e.code === "raw_biometric_material_forbidden",
  );
  assert.throws(
    () => assertTrustFaceLivenessRequest(request({ payload: { blob: Buffer.from("mock") } })),
    (e) => e instanceof TrustBiometricAdapterContractError && e.code === "raw_biometric_material_forbidden",
  );
});

test("normalizes signals without creating a governed decision", () => {
  const normalized = normalizeTrustFaceLivenessResult({ manifest: manifest(), result: result() });
  assert.deepEqual(normalized.signals, { faceMatchScore: 0.93, livenessScore: 0.97, livenessPassed: true });
  assert.equal(normalized.productionAuthorized, false);
  assert.equal(Object.hasOwn(normalized, "decision"), false);
  assert.equal(Object.hasOwn(normalized, "subjectRef"), false);
  assert.equal(normalized.rawBiometricMaterialForwarded, false);
  assert.equal(normalized.rawBiometricMaterialPersisted, false);
});

test("rejects unsafe provider results", () => {
  assert.throws(
    () => normalizeTrustFaceLivenessResult({ manifest: manifest(), result: result({ raw_image: "forbidden" }) }),
    (e) => e instanceof TrustBiometricAdapterContractError && e.code === "raw_biometric_material_forbidden",
  );
});

test("forwards only canonical references to the sandbox mock", async () => {
  const observed = [];
  const preflight = createTrustBiometricAdapterPreflight({
    manifest: manifest(),
    invokeSandboxMock: async (safeRequest) => {
      observed.push(safeRequest);
      return result();
    },
  });
  const noisyRequest = request({ payload: "opaque-noncanonical-string", metadata: { note: "ignored" } });
  const normalized = await preflight.verifyFaceLiveness(noisyRequest);
  assert.deepEqual(observed, [request()]);
  assert.equal(Object.hasOwn(observed[0], "payload"), false);
  assert.equal(Object.hasOwn(observed[0], "metadata"), false);
  assert.equal(normalized.providerId, "provider.pending-authorization");
  assert.equal(normalized.rawBiometricMaterialForwarded, false);
  assert.equal(normalized.rawBiometricMaterialPersisted, false);
});
