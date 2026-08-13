const FORBIDDEN_KEYS = new Set([
  "apikey",
  "api_key",
  "secret",
  "clientsecret",
  "client_secret",
  "password",
  "passwd",
  "authorization",
  "bearer",
  "accesstoken",
  "access_token",
  "refreshtoken",
  "refresh_token",
  "privatekey",
  "private_key",
  "pan",
  "cardnumber",
  "card_number",
  "cvv",
  "cvc",
  "biometric",
  "biometrictemplate",
  "biometric_template",
  "faceimage",
  "face_image",
  "irisscan",
  "iris_scan",
  "palmimage",
  "palm_image",
]);

const REQUIRED_STATUS_MAP = Object.freeze(["authorized", "declined", "pending"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    fail("TRUST_PAYMENT_PROVIDER_MANIFEST_INVALID", `${name} is required`);
  }
  return normalized;
}

function asObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_PROVIDER_MANIFEST_INVALID", `${name} must be an object`);
  }
  return value;
}

function asStringArray(value, name) {
  if (!Array.isArray(value) || value.length === 0) {
    fail("TRUST_PAYMENT_PROVIDER_MANIFEST_INVALID", `${name} must be a non-empty array`);
  }
  const normalized = value.map((item, index) => required(item, `${name}[${index}]`));
  return Object.freeze([...new Set(normalized)]);
}

function assertNoSensitiveMaterial(value, path = "manifest") {
  if (value == null) return true;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveMaterial(item, `${path}[${index}]`));
    return true;
  }
  if (typeof value !== "object") return true;

  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      fail(
        "TRUST_PAYMENT_PROVIDER_MANEFEST_SENSITIVE_MATERIAL",
       `${path}.${key} is forbidden in provider manifests`,
      );
    }
    assertNoSensitiveMaterial(child, `${path}.${key}`);
  }
  return true;
}

function normalizeOperations(value) {
  const operations = asStringArray(value, "capabilities.operations");
  const allowed = new Set(["authorize", "reconcile", "health", "readiness"]);
  for (const operation of operations) {
    if (!allowed.has(operation)) {
      fail("TRUST_PAYMENT_PROVIDER_MANIFEST_INVALID_OPERATION", `unsupported operation ${operation}`);
    }
  }
  for (const mandatory of ["authorize", "reconcile", "health", "readiness"]) {
    if (!operations.includes(mandatory)) {
      fail("TRUST_PAYMENT_PROVIDER_MANEFEST_MISSING_CAPABILITY", `${mandatory} capability is required`);
    }
  }
  return operations;
}

export function createBiometricPaymentProviderConformanceManifest(input = {}) {
  assertNoSensitiveMaterial(input);
  const manifest = asObject(input, "manifest");
  const provider = asObject(manifest.provider, "provider");
  const capabilities = asObject(manifest.capabilities, "capabilities");
  const dataBoundary = asObject(manifest.dataBoundary, "dataBoundary");
  const operations = normalizeOperations(capabilities.operations);
  const currencies = asStringArray(capabilities.supportedCurrencies, "capabilities.supportedCurrencies");
  const countries = asStringArray(capabilities.supportedCountries, "capabilities.supportedCountries");
  const statusMap = asObject(manifest.statusMap, "statusMap");

  if (provider.mode !== "sandbox") {
    fail("TRUST_PAYMENT_PROVIDER_MANEFEST_SANDBOX_REQUIRED", "provider.mode must be sandbox");
  }
  if (capabilities.idempotencyGuaranteed !== true) {
    fail("TRUST_PAYMENT_PROVIDER_MANIFEST_IDEMPOTENCY_REQUIRED", "idempotencyGuaranteed must be true");
  }
  if (capabilities.financialExecutionCapable === true) {
    fail(
      "TRUST_PAYMENT_PROVIDER_MANEFEST_REAL_MONEY_BLOCKED",
      "sandbox conformance manifest must not declare real-money capability",
    );
  }

  const normalizedStatusMap = {};
  for (const status of REQUIRED_STATUS_MAP) {
    const mapped = String(statusMap[status] ?? "").trim();
    if (!mapped) {
      fail("TRUST_PAYMENT_PROVIDER_MANEFEST_STATUS_MAP_REQUIRED", `${status} status mapping is required`);
    }
    normalizedStatusMap[status] = mapped;
  }

  const timeoutMs = Number(manifest.timeoutMs ?? 2500);
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) {
    fail("TRUST_PAYMENT_PROVIDER_MANEFEST_INVALID_TIMEOUT", "timeoutMs must be an integer between 100 and 120000");
  }

  const boundaryRules = {
    platformReceivesRawPaymentInstrument: dataBoundary.platformReceivesRawPaymentInstrument === true,
    platformReceivesRawBiometricMaterial: dataBoundary.platformReceivesRawBiometricMaterial === true,
    platformStoresProviderSecrets: dataBoundary.platformStoresProviderSecrets === true,
    providerHostedSensitiveData: dataBoundary.providerHostedSensitiveData === true,
    secretInjection: required(dataBoundary.secretInjection, "dataBoundary.secretInjection"),
  };

  if (
    boundaryRules.platformReceivesRawPaymentInstrument
    || boundaryRules.platformReceivesRawBiometricMaterial
    || boundaryRules.platformStoresProviderSecrets
  ) {
    fail(
      "TRUST_PAYMENT_PROVIDER_MANIFEST_DATA_BOUNDARY_VIOLATION",
      "provider manifest violates the platform sensitive-data boundary",
    );
  }
  if (boundaryRules.providerHostedSensitiveData !== true) {
    fail(
      "TRUST_PAYMENT_PROVIDER_MANIFEST_HOSTED_BOUNDARY_REQUIRED",
      "providerHostedSensitiveData must be true",
    );
  }
  if (boundaryRules.secretInjection !== "runtime_reference") {
    fail(
      "TRUST_PAYMENT_PROVIDER_MANIFEST_SECRET_INJECTION_INVALID",
      "secretInjection must be runtime_reference",
    );
  }

  const normalized = Object.freeze({
    type: "BiometricPaymentProviderConformanceManifest",
    version: "1.0.0",
    provider: Object.freeze({
      providerId: required(provider.providerId, "provider.providerId"),
      displayName: required(provider.displayName, "provider.displayName"),
      adapterVersion: required(provider.adapterVersion, "provider.adapterVersion"),
      mode: "sandbox",
      selectionStatus: required(provider.selectionStatus ?? "candidate", "provider.selectionStatus"),
    }),
    capabilities: Object.freeze({
      operations,
      supportedCurrencies: currencies,
      supportedCountries: countries,
      idempotencyGuaranteed: true,
      safeRetryAfterTransportFailure: capabilities.safeRetryAfterTransportFailure === true,
      financialExecutionCapable: false,
      correlationIdSupported: capabilities.correlationIdSupported === true,
      killSwitchSupported: capabilities.killSwitchSupported === true,
    }),
    dataBoundary: Object.freeze(boundaryRules),
    statusMap: Object.freeze({
      authorized: normalizedStatusMap.authorized,
      declined: normalizedStatusMap.declined,
      pending: normalizedStatusMap.pending,
    }),
    timeoutMs,
    certification: Object.freeze({
      requiredHarness: "global-trust-payment-provider-sandbox-certification-v1",
      externalEgressRequired: false,
      realMoneyRequired: false,
    }),
  });

  return normalized;
}

export function evaluateBiometricPaymentProviderConformance(manifestInput = {}) {
  try {
    const manifest = createBiometricPaymentProviderConformanceManifest(manifestInput);
    const blockers = [];

    if (!manifest.capabilities.correlationIdSupported) blockers.push("correlation_id_support_required");
    if (!manifest.capabilities.killSwitchSupported) blockers.push("kill_switch_support_required");

    return Object.freeze({
      type: "BiometricPaymentProviderConformanceReport",
      version: "1.0.0",
      providerId: manifest.provider.providerId,
      status: blockers.length === 0 ? "ready_for_sandbox_adapter" : "blocked",
      blockers: Object.freeze(blockers),
      providerSelectedByInstitution: false,
      productionApproved: false,
      realMoneyApproved: false,
      manifest,
    });
  } catch (error) {
    return Object.freeze({
      type: "BiometricPaymentProviderConformanceReport",
      version: "1.0.0",
      providerId: null,
      status: "invalid",
      blockers: Object.freeze([error.code ?? "TRUST_PAYMENT_PROVIDER_MANIFEST_INVALID"]),
      providerSelectedByInstitution: false,
      productionApproved: false,
      realMoneyApproved: false,
      manifest: null,
    });
  }
}
