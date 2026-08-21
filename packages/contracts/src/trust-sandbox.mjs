export const TRUST_PRODUCT_ID = "product:trust";
export const TRUST_SANDBOX_ENVIRONMENT = "sandbox";
export const TRUST_SANDBOX_PROVISIONING_SCOPE = "saas:provision";

export const TRUST_SANDBOX_SCOPES = Object.freeze([
  "trust:verification:create",
  "trust:verification:read",
  "trust:governance:preview",
  "trust:evidence:read",
  "trust:audit:read",
]);

export const TRUST_SANDBOX_VERIFICATION_MODALITIES = Object.freeze([
  "face",
  "face+liveness",
  "liveness",
  "palm",
  "iris",
  "fingerprint",
]);

export const TRUST_SANDBOX_PROVISIONING_CONTRACT = Object.freeze({
  path: "/v1/saas/trust/sandbox/provision",
  productId: TRUST_PRODUCT_ID,
  environment: TRUST_SANDBOX_ENVIRONMENT,
  requiredProvisioningScope: TRUST_SANDBOX_PROVISIONING_SCOPE,
  issuedScopes: TRUST_SANDBOX_SCOPES,
  oneTimeSecret: true,
  persistedSecret: false,
  productionPromotion: false,
  realBiometrics: false,
  realMoney: false,
});

export const TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT = Object.freeze({
  method: "POST",
  path: "/v1/verifications",
  requiredScope: "trust:verification:create",
  environment: TRUST_SANDBOX_ENVIRONMENT,
  mode: "mock",
  acceptedFields: Object.freeze(["subjectRef", "modality"]),
  biometricProcessing: false,
  adapter: "none",
  productionPromotion: false,
});

export const TRUST_SANDBOX_VERIFICATION_READ_CONTRACT = Object.freeze({
  method: "GET",
  pathPrefix: "/v1/verifications/",
  requiredScope: "trust:verification:read",
  environment: TRUST_SANDBOX_ENVIRONMENT,
  mode: "mock",
  tenantScoped: true,
  notFoundOnCrossTenant: true,
});

export const TRUST_SANDBOX_GOVERNANCE_PREVIEW_CONTRACT = Object.freeze({
  method: "POST",
  pathPrefix: "/v1/verifications/",
  pathSuffix: "/governance-preview",
  requiredScope: "trust:governance:preview",
  environment: TRUST_SANDBOX_ENVIRONMENT,
  mode: "preview",
  tenantScoped: true,
  notFoundOnCrossTenant: true,
  executionAllowed: false,
  mutationAllowed: false,
  realBiometrics: false,
});

export const TRUST_SANDBOX_EVIDENCE_READ_CONTRACT = Object.freeze({
  method: "GET",
  pathPrefix: "/v1/evidence/",
  requiredScope: "trust:evidence:read",
  environment: TRUST_SANDBOX_ENVIRONMENT,
  tenantScoped: true,
  notFoundOnCrossTenant: true,
});

export const TRUST_SANDBOX_AUDIT_READ_CONTRACT = Object.freeze({
  method: "GET",
  pathPrefix: "/v1/audit/events/",
  requiredScope: "trust:audit:read",
  environment: TRUST_SANDBOX_ENVIRONMENT,
  mode: "advisory",
  tenantScoped: true,
  notFoundOnCrossTenant: true,
});
