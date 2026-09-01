import { createGovernedTemplateVaultFlow } from "./governed-template-vault-flow-v1.mjs";
import {
  createTemplateVaultAccessTrustRegistry,
  createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess,
} from "./template-vault-access-trust-registry-v1.mjs";

export const TRUST_FACE_SIGNED_GOVERNED_TEMPLATE_VAULT_FLOW_V1 = Object.freeze({
  version: "trust-face-signed-governed-template-vault-flow/v1",
  purpose: "compose-governed-vault-lifecycle-with-lab-trusted-key-proof-verification",
  mode: "simulation-lab-only",
  signedAccessLifecycleComposed: true,
  metadataOnly: true,
  labTrustRegistryIntegrated: true,
  cryptographicAuthorizationProofVerifiedInLab: true,
  signingPerformed: false,
  privateKeyAccepted: false,
  privateKeyStored: false,
  externalAuthorizationIssuerIntegrated: false,
  externalRevocationAuthorityIntegrated: false,
  productionTrustRegistryIntegrated: false,
  productionKeyManagementIntegrated: false,
  productionCryptographicAuthorizationProofVerified: false,
  realVaultAccessAuthorized: false,
  realVaultRevocationEnforced: false,
  realEnrollmentReady: false,
  realVaultReady: false,
  livenessPad: false,
  productionReady: false,
  biometricClaimReady: false,
});

export class TrustFaceSignedGovernedTemplateVaultFlowV1Error extends Error {
  constructor(code, message) {
    super(message);
    this.name = "TrustFaceSignedGovernedTemplateVaultFlowV1Error";
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new TrustFaceSignedGovernedTemplateVaultFlowV1Error(code, message);
};

const assertMethod = (value, method, name) => {
  if (!value || typeof value[method] !== "function") {
    fail(`invalid_${name}`, `${name} must provide ${method}`);
  }
};

export function createSignedGovernedTemplateVaultFlow({
  enrollmentRepository,
  revocationRepository,
  receiptRepository,
  trustedKeyRepository,
  trustedKeyRevocationRepository,
} = {}) {
  const governedFlow = createGovernedTemplateVaultFlow({
    enrollmentRepository,
    revocationRepository,
    receiptRepository,
  });
  assertMethod(governedFlow, "getAuthorizedReceipt", "governed_flow");

  const trustRegistry = createTemplateVaultAccessTrustRegistry({
    keyRepository: trustedKeyRepository,
    revocationRepository: trustedKeyRevocationRepository,
  });
  assertMethod(trustRegistry, "resolveTrustedPublicKey", "trust_registry");

  const authorizedReceiptAccess = Object.freeze({
    getAuthorizedReceipt(args) {
      return governedFlow.getAuthorizedReceipt(args);
    },
  });

  const verifiedAccess =
    createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess({
      authorizedReceiptAccess,
      trustRegistry,
    });
  assertMethod(
    verifiedAccess,
    "getRegistryBackedCryptographicallyVerifiedAuthorizedReceipt",
    "registry_backed_verified_access",
  );

  return Object.freeze({
    ...TRUST_FACE_SIGNED_GOVERNED_TEMPLATE_VAULT_FLOW_V1,

    enroll(input) {
      return governedFlow.enroll(input);
    },
    recordVaultReceipt(input) {
      return governedFlow.recordVaultReceipt(input);
    },
    createLabAccessAuthorization(input) {
      return governedFlow.createLabAccessAuthorization(input);
    },
    getAuthorizedReceipt(input) {
      return governedFlow.getAuthorizedReceipt(input);
    },
    createLabRevocationAuthorization(input) {
      return governedFlow.createLabRevocationAuthorization(input);
    },
    revokeEnrollment(input) {
      return governedFlow.revokeEnrollment(input);
    },
    getLifecycleSnapshot(input) {
      return governedFlow.getLifecycleSnapshot(input);
    },

    registerLabTrustedPublicKey(input) {
      return trustRegistry.registerTrustedPublicKey(input);
    },
    revokeLabTrustedPublicKey(input) {
      return trustRegistry.revokeTrustedPublicKey(input);
    },
    getTrustedKeyLifecycleSnapshot(keyId, options) {
      return trustRegistry.getKeyLifecycleSnapshot(keyId, options);
    },

    getCryptographicallyVerifiedAuthorizedReceipt(input) {
      return verifiedAccess.getRegistryBackedCryptographicallyVerifiedAuthorizedReceipt(input);
    },
  });
}
