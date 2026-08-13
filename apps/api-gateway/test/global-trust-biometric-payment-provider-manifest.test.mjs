import assert from "node:assert/strict";
import test from "node:test";

import {
  createBiometricPaymentProviderConformanceManifest,
  evaluateBiometricPaymentProviderConformance,
} from "../src/global-trust-biometric-payment-provider-manifest.mjs";

function validManifest(overrides = {}) {
  return {
    provider: {
      providerId: "candidate.provider-neutral",
      displayName: "Provider Neutral Sandbox",
      adapterVersion: "1.0.0",
      mode: "sandbox",
      selectionStatus: "candidate",
      ...(overrides.provider ?? {}),
    },
    capabilities: {
      operations: ["authorize", "reconcile", "health", "readiness"],
      supportedCurrencies: ["BRL"],
      supportedCountries: ["BR"],
      idempotencyGuaranteed: true,
      safeRetryAfterTransportFailure: true,
      financialExecutionCapable: false,
      correlationIdSupported: true,
      killSwitchSupported: true,
      ...(overrides.capabilities ?? {}),
    },
    dataBoundary: {
      platformReceivesRawPaymentInstrument: false,
      platformReceivesRawBiometricMaterial: false,
      platformStoresProviderSecrets: false,
      providerHostedSensitiveData: true,
      secretInjection: "runtime_reference",
      ...(overrides.dataBoundary ?? {}),
    },
    statusMap: {
      authorized: "AUTHORIZED",
      declined: "DECLINED",
      pending: "PENDING",
      ...(overrides.statusMap ?? {}),
    },
    timeoutMs: overrides.timeoutMs ?? 2500,
    ...Object.fromEntries(
      Object.entries(overrides).filter(
        ([key]) => !["provider", "capabilities", "dataBoundary", "statusMap", "timeoutMs"].includes(key),
      ),
    ),
  };
}

test("valid sandbox manifest is provider-neutral and ready for adapter certification", () => {
  const manifest = createBiometricPaymentProviderConformanceManifest(validManifest());
  assert.equal(manifest.type, "BiometricPaymentProviderConformanceManifest");
  assert.equal(manifest.provider.mode, "sandbox");
  assert.equal(manifest.capabilities.financialExecutionCapable, false);
  assert.equal(manifest.dataBoundary.platformReceivesRawPaymentInstrument, false);
  assert.equal(manifest.dataBoundary.platformReceivesRawBiometricMaterial, false);
  assert.equal(manifest.dataBoundary.platformStoresProviderSecrets, false);
  assert.equal(manifest.certification.externalEgressRequired, false);
  assert.equal(manifest.certification.realMoneyRequired, false);

  const report = evaluateBiometricPaymentProviderConformance(validManifest());
  assert.equal(report.status, "ready_for_sandbox_adapter");
  assert.equal(report.providerSelectedByInstitution, false);
  assert.equal(report.productionApproved, false);
  assert.equal(report.realMoneyApproved, false);
});

test("manifest rejects external mode and real-money capability", () => {
  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      provider: { mode: "external" },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_SANDBOX_REQUIRED",
  );

  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      capabilities: { financialExecutionCapable: true },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_REAL_MONEY_BLOCKED",
  );
});

test("manifest rejects raw payment instrument, biometric material and stored secrets", () => {
  for (const dataBoundary of [
    { platformReceivesRawPaymentInstrument: true },
    { platformReceivesRawBiometricMaterial: true },
    { platformStoresProviderSecrets: true },
  ]) {
    assert.throws(
      () => createBiometricPaymentProviderConformanceManifest(validManifest({ dataBoundary })),
      (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_DATA_BOUNDARY_VIOLATION",
    );
  }
});

test("manifest rejects inline secret and card-data fields anywhere in the payload", () => {
  const samples = [
    { apiKey: "should-not-be-here" },
    { nested: { client_secret: "should-not-be-here" } },
    { credentials: { access_token: "should-not-be-here" } },
    { payment: { pan: "4111111111111111" } },
    { payment: { cvv: "123" } },
    { device: { biometric_template: "bytes" } },
    { device: { face_image: "bytes" } },
  ];

  for (const sample of samples) {
    assert.throws(
      () => createBiometricPaymentProviderConformanceManifest(validManifest(sample)),
      (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_SENSITIVE_MATERIAL",
    );
  }
});

test("manifest requires provider-hosted sensitive data and runtime secret references", () => {
  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      dataBoundary: { providerHostedSensitiveData: false },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_HOSTED_BOUNDARY_REQUIRED",
  );

  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      dataBoundary: { secretInjection: "inline" },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_SECRET_INJECTION_INVALID",
  );
});

test("conformance report blocks adapters without correlation or kill switch support", () => {
  const report = evaluateBiometricPaymentProviderConformance(validManifest({
    capabilities: {
      correlationIdSupported: false,
      killSwitchSupported: false,
    },
  }));

  assert.equal(report.status, "blocked");
  assert.deepEqual(
    [...report.blockers].sort(),
    ["correlation_id_support_required", "kill_switch_support_required"].sort(),
  );
});

test("manifest requires deterministic status mappings", () => {
  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      statusMap: { pending: "" },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_STATUS_MAP_REQUIRED",
  );
});

test("manifest requires reconcile and all mandatory provider operations", () => {
  assert.throws(
    () => createBiometricPaymentProviderConformanceManifest(validManifest({
      capabilities: { operations: ["authorize", "health", "readiness"] },
    })),
    (error) => error.code === "TRUST_PAYMENT_PROVIDER_MANIFEST_MISSING_CAPABILITY",
  );
});
