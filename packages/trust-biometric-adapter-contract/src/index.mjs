const VERSION = "trust-biometric-adapter/v1";
const MODE = "sandbox-conformance";
const BAD_KEY = /(^|[_-])(raw|image|video|selfie|photo|template|embedding|biometric)s?([_-]|$)/i;

export class TrustBiometricAdapterContractError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustBiometricAdapterContractError";
    this.code = code;
  }
}

function fail(code, message) {
  throw new TrustBiometricAdapterContractError(code, message);
}

function record(value, field) {
  if (!value || typeof value !== "object" || Array.isArray(value)) fail("invalid_input", `${field} must be an object`);
  return value;
}

function text(value, field) {
  if (typeof value !== "string" || !value.trim()) fail("invalid_input", `${field} must be a non-empty string`);
  return value.trim();
}

function scan(value, path = "$") {
  if (value === null || value === undefined) return;
  if (Buffer.isBuffer(value) || ArrayBuffer.isView(value) || value instanceof ArrayBuffer) {
    fail("raw_biometric_material_forbidden", `binary material is forbidden at ${path}`);
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scan(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (BAD_KEY.test(key)) fail("raw_biometric_material_forbidden", `field ${path}.${key} is forbidden`);
    scan(nested, `${path}.${key}`);
  }
}

function score(value, field) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    fail("invalid_score", `${field} must be between 0 and 1`);
  }
  return value;
}

export const TRUST_BIOMETRIC_ADAPTER_CONTRACT = Object.freeze({
  version: VERSION,
  mode: MODE,
  requiredCapabilities: Object.freeze({ faceVerification: true, liveness: true }),
  productionEnabled: false,
  rawBiometricPersistenceAllowed: false,
  rawBiometricLoggingAllowed: false,
});

export function assertTrustBiometricAdapterManifest(manifest) {
  const value = record(manifest, "manifest");
  if (value.contractVersion !== VERSION) fail("unsupported_contract_version", `contractVersion must equal ${VERSION}`);
  const providerId = text(value.providerId, "providerId");
  if (!/^[a-z0-9][a-z0-9._-]{1,127}$/i.test(providerId)) fail("invalid_provider_id", "providerId is invalid");
  if (value.mode !== MODE) fail("provider_not_authorized", `mode must remain ${MODE}`);
  if (value.productionEnabled !== false) fail("production_not_authorized", "production is blocked in preflight");

  const capabilities = record(value.capabilities, "capabilities");
  if (capabilities.faceVerification !== true || capabilities.liveness !== true) {
    fail("required_capability_missing", "face verification and liveness are required");
  }

  const data = record(value.dataHandling, "dataHandling");
  if (data.rawBiometricPersistence !== false || data.rawBiometricLogging !== false) {
    fail("raw_biometric_storage_forbidden", "raw biometric persistence and logging must be disabled");
  }
  if (data.providerReference !== true) fail("provider_reference_required", "providerReference is required");

  return Object.freeze({
    contractVersion: VERSION,
    providerId,
    mode: MODE,
    productionEnabled: false,
    capabilities: Object.freeze({ faceVerification: true, liveness: true }),
    dataHandling: Object.freeze({
      rawBiometricPersistence: false,
      rawBiometricLogging: false,
      providerReference: true,
    }),
  });
}

export function assertTrustFaceLivenessRequest(request) {
  const value = record(request, "request");
  scan(value);
  if (value.environment !== "sandbox") fail("production_not_authorized", "sandbox requests only");
  return Object.freeze({
    environment: "sandbox",
    tenantId: text(value.tenantId, "tenantId"),
    verificationId: text(value.verificationId, "verificationId"),
    subjectRef: text(value.subjectRef, "subjectRef"),
    providerSessionRef: text(value.providerSessionRef, "providerSessionRef"),
    consentRef: text(value.consentRef, "consentRef"),
  });
}

export function normalizeTrustFaceLivenessResult({ manifest, result }) {
  const safeManifest = assertTrustBiometricAdapterManifest(manifest);
  const value = record(result, "result");
  scan(value);
  const status = text(value.status, "status");
  if (!["completed", "review", "failed"].includes(status)) fail("invalid_status", "invalid provider status");
  if (typeof value.livenessPassed !== "boolean") fail("invalid_liveness_result", "livenessPassed must be boolean");
  const reasonCodes = Array.isArray(value.reasonCodes) ? value.reasonCodes.map((v) => text(v, "reasonCode")) : [];

  return Object.freeze({
    contractVersion: VERSION,
    providerId: safeManifest.providerId,
    adapterMode: MODE,
    status,
    modality: "face",
    livenessPerformed: true,
    providerReference: text(value.providerReference, "providerReference"),
    signals: Object.freeze({
      faceMatchScore: score(value.faceMatchScore, "faceMatchScore"),
      livenessScore: score(value.livenessScore, "livenessScore"),
      livenessPassed: value.livenessPassed,
    }),
    reasonCodes: Object.freeze(reasonCodes),
    productionAuthorized: false,
    rawBiometricMaterialForwarded: false,
    rawBiometricMaterialPersisted: false,
  });
}

export function createTrustBiometricAdapterPreflight({ manifest, invokeSandboxMock }) {
  const safeManifest = assertTrustBiometricAdapterManifest(manifest);
  if (typeof invokeSandboxMock !== "function") fail("sandbox_mock_required", "invokeSandboxMock is required");
  return Object.freeze({
    manifest: safeManifest,
    async verifyFaceLiveness(request) {
      const safeRequest = assertTrustFaceLivenessRequest(request);
      const result = await invokeSandboxMock(safeRequest);
      return normalizeTrustFaceLivenessResult({ manifest: safeManifest, result });
    },
  });
}
