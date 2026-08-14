const REQUIRED_GATES = Object.freeze([
  "providerSelectedByInstitution",
  "providerContractApproved",
  "providerSandboxCertified",
  "providerReconciliationCertified",
  "productionDatastoreReady",
  "deviceCompatibilityValidated",
  "securityReviewApproved",
  "privacyReviewApproved",
  "legalReviewApproved",
  "regulatoryReviewApproved",
  "observabilityReady",
  "incidentResponseReady",
  "rollbackCompensationReady",
  "deployApproved",
  "externalEgressApproved",
  "realMoneyApproved",
]);

const FORBIDDEN_KEYS = new Set([
  "apikey", "api_key", "secret", "clientsecret", "client_secret",
  "password", "authorization", "bearer", "accesstoken", "access_token",
  "privatekey", "private_key", "pan", "cardnumber", "card_number",
  "cvv", "cvc", "biometric", "biometrictemplate", "biometric_template",
  "faceimage", "face_image", "irisscan", "iris_scan", "palmimage", "palm_image",
]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_PAYMENT_PRODUCTION_ACTIVATION_INVALID", `${name} is required`);
  return normalized;
}

function iso(value, name) {
  const normalized = required(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("TRUST_PAYMENT_PRODUCTION_ACTIVATION_INVALID", `${name} must be ISO-8601`);
  }
  return normalized;
}

function asObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_PRODUCTION_ACTIVATION_INVALID", `${name} must be an object`);
  }
  return value;
}

function assertNoSensitiveMaterial(value, path = "activation") {
  if (value == null || typeof value !== "object") return true;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSensitiveMaterial(item, `${path}[${index}]`));
    return true;
  }
  for (const [key, child] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9_]/g, "");
    if (FORBIDDEN_KEYS.has(normalizedKey)) {
      fail(
        "TRUST_PAYMENT_PRODUCTION_ACTIVATION_SENSITIVE_MATERIAL",
        `${path}.${key} is forbidden in activation evidence`,
      );
    }
    assertNoSensitiveMaterial(child, `${path}.${key}`);
  }
  return true;
}

function normalizeGate(value, name) {
  const gate = asObject(value, `gates.${name}`);
  return Object.freeze({
    approved: gate.approved === true,
    evidenceRef: gate.evidenceRef == null ? null : required(gate.evidenceRef, `gates.${name}.evidenceRef`),
    approvedAt: gate.approvedAt == null ? null : iso(gate.approvedAt, `gates.${name}.approvedAt`),
  });
}

export function evaluateBiometricPaymentProductionActivation(input = {}) {
  try {
    assertNoSensitiveMaterial(input);
    const activation = asObject(input, "activation");
    const providerId = required(activation.providerId, "providerId");
    const environment = required(activation.environment, "environment");
    const gatesInput = asObject(activation.gates, "gates");
    if (environment !== "production") {
      fail(
        "TRUST_PAYMENT_PRODUCTION_ACTIVATION_ENVIRONMENT_INVALID",
        "production activation evidence must target environment=production",
      );
    }

    const gates = {};
    const blockers = [];
    for (const gateName of REQUIRED_GATES) {
      if (!Object.hasOwn(gatesInput, gateName)) {
        blockers.push(`${gateName}:missing`);
        continue;
      }
      const gate = normalizeGate(gatesInput[gateName], gateName);
      gates[gateName] = gate;
      if (gate.approved !== true) blockers.push(`${gateName}:not_approved`);
      if (!gate.evidenceRef) blockers.push(`${gateName}:evidence_missing`);
      if (!gate.approvedAt) blockers.push(`${gateName}:approval_time_missing`);
    }

    return Object.freeze({
      type: "BiometricPaymentProductionActivationReport",
      version: "1.0.0",
      providerId,
      environment: "production",
      status: blockers.length === 0 ? "approved" : "blocked",
      blockers: Object.freeze(blockers),
      gates: Object.freeze(gates),
      rawBiometricDataIncluded: false,
      paymentSecretsIncluded: false,
    });
  } catch (error) {
    return Object.freeze({
      type: "BiometricPaymentProductionActivationReport",
      version: "1.0.0",
      providerId: null,
      environment: null,
      status: "invalid",
      blockers: Object.freeze([error.code ?? "TRUST_PAYMENT_PRODUCTION_ACTIVATION_INVALID"]),
      gates: Object.freeze({}),
      rawBiometricDataIncluded: false,
      paymentSecretsIncluded: false,
    });
  }
}

export function assertBiometricPaymentProductionActivation(input = {}, { providerId = null } = {}) {
  const report = evaluateBiometricPaymentProductionActivation(input);
  if (report.status !== "approved") {
    const error = new Error("biometric payment production activation is blocked");
    error.code = "TRUST_PAYMENT_PRODUCTION_ACTIVATION_BLOCKED";
    error.report = report;
    throw error;
  }
  if (providerId != null && report.providerId !== required(providerId, "providerId")) {
    const error = new Error("production activation evidence does not match payment provider");
    error.code = "TRUST_PAYMENT_PRODUCTION_ACTIVATION_PROVIDER_MISMATCH";
    error.report = report;
    throw error;
  }
  return report;
}

export { REQUIRED_GATES as BIOMETRIC_PAYMENT_PRODUCTION_ACTIVATION_GATES };
