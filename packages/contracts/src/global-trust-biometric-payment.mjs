import {
  assertHeader,
  bool,
  enumeration,
  finalize,
  header,
  id,
  iso,
  object,
  optionalString,
  positiveInteger,
  string,
} from "./global-trust-support.mjs";
import { assertAuthenticationContextContract } from "./global-trust-identity.mjs";

const SHA256 = /^[a-f0-9]{64}$/i;
const BASE64URL = /^[A-Za-z0-9_-]{43,}$/;
const ISO_CURRENCY = /^[A-Z]{3}$/;

export const BIOMETRIC_PAYMENT_CEREMONIES = new Set([
  "webauthn",
  "secure_payment_confirmation",
]);

export const LOCAL_VERIFICATION_METHOD_HINTS = new Set([
  "face",
  "iris",
  "palm",
  "fingerprint",
  "device_pin",
  "other",
  "unknown",
]);

function digest(value, name) {
  const normalized = string(value, name);
  if (!SHA256.test(normalized)) throw new Error(`${name} must be a SHA-256 hex digest`);
  return normalized.toLowerCase();
}

function currency(value, name) {
  const normalized = string(value, name);
  if (!ISO_CURRENCY.test(normalized)) throw new Error(`${name} must be an ISO 4217 currency code`);
  return normalized;
}

function challengeToken(value, name) {
  const normalized = string(value, name);
  if (!BASE64URL.test(normalized)) throw new Error(`${name} must be unpadded base64url with at least 32 bytes of entropy`);
  return normalized;
}

function optionalVerificationMethodHint(value, name) {
  if (value == null) return null;
  return enumeration(value, name, LOCAL_VERIFICATION_METHOD_HINTS);
}

function optionalOrigin(value, name) {
  if (value == null) return null;
  const normalized = string(value, name);
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${name} must be a valid HTTPS origin`);
  }
  if (parsed.protocol !== "https:" || parsed.origin !== normalized) {
    throw new Error(`${name} must be an exact HTTPS origin`);
  }
  return normalized;
}

function rpId(value, name) {
  const normalized = string(value, name).toLowerCase();
  if (
    normalized.includes("://")
    || normalized.includes("/")
    || normalized.includes("@")
    || normalized.startsWith(".")
    || normalized.endsWith(".")
  ) {
    throw new Error(`${name} must be a relying-party domain`);
  }
  return normalized;
}

function amountValue(value, name) {
  const normalized = string(value, name);
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,12})?$/.test(normalized)) {
    throw new Error(`${name} must be a canonical non-negative decimal amount`);
  }
  return normalized;
}

function mustBeFalse(value, name) {
  bool(value, name);
  if (value !== false) throw new Error(`${name} must be false`);
}

function mustBeTrue(value, name) {
  bool(value, name);
  if (value !== true) throw new Error(`${name} must be true`);
}

function assertChronology(earlier, later, name) {
  if (Date.parse(later) < Date.parse(earlier)) throw new Error(`${name} is chronologically invalid`);
}

export function assertBiometricPaymentIntentContract(value, name = "biometricPaymentIntent") {
  assertHeader(value, "BiometricPaymentIntent", name);
  id(value.paymentIntentId, `${name}.paymentIntentId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.payeeId, `${name}.payeeId`);
  positiveInteger(value.amountMinor, `${name}.amountMinor`);
  currency(value.currency, `${name}.currency`);
  string(value.purposeCode, `${name}.purposeCode`);
  iso(value.createdAt, `${name}.createdAt`);
  iso(value.expiresAt, `${name}.expiresAt`);
  assertChronology(value.createdAt, value.expiresAt, `${name}.createdAt/expiresAt`);
  mustBeTrue(value.consentRequired, `${name}.consentRequired`);
  mustBeFalse(value.sensitivePaymentInstrumentDataIncluded, `${name}.sensitivePaymentInstrumentDataIncluded`);
  return value;
}

export function createBiometricPaymentIntent({
  paymentIntentId,
  subjectId,
  tenantId,
  payeeId,
  amountMinor,
  currency: currencyCode,
  purposeCode,
  createdAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  return finalize({
    ...header("BiometricPaymentIntent"),
    paymentIntentId,
    subjectId,
    tenantId,
    payeeId,
    amountMinor,
    currency: currencyCode,
    purposeCode,
    createdAt,
    expiresAt,
    consentRequired: true,
    sensitivePaymentInstrumentDataIncluded: false,
  }, assertBiometricPaymentIntentContract);
}

export function assertBiometricPaymentChallengeContract(value, name = "biometricPaymentChallenge") {
  assertHeader(value, "BiometricPaymentChallenge", name);
  id(value.challengeId, `${name}.challengeId`);
  id(value.paymentIntentId, `${name}.paymentIntentId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.credentialId, `${name}.credentialId`);
  enumeration(value.ceremony, `${name}.ceremony`, BIOMETRIC_PAYMENT_CEREMONIES);
  challengeToken(value.challengeB64u, `${name}.challengeB64u`);
  digest(value.challengeDigest, `${name}.challengeDigest`);
  digest(value.paymentContextDigest, `${name}.paymentContextDigest`);

  object(value.paymentContext, `${name}.paymentContext`);
  id(value.paymentContext.payeeId, `${name}.paymentContext.payeeId`);
  positiveInteger(value.paymentContext.amountMinor, `${name}.paymentContext.amountMinor`);
  currency(value.paymentContext.currency, `${name}.paymentContext.currency`);
  string(value.paymentContext.purposeCode, `${name}.paymentContext.purposeCode`);

  rpId(value.rpId, `${name}.rpId`);
  if (value.expectedOrigin == null) throw new Error(`${name}.expectedOrigin is required`);
  optionalOrigin(value.expectedOrigin, `${name}.expectedOrigin`);
  optionalOrigin(value.expectedTopOrigin, `${name}.expectedTopOrigin`);
  optionalString(value.expectedPayeeName, `${name}.expectedPayeeName`);
  optionalOrigin(value.expectedPayeeOrigin, `${name}.expectedPayeeOrigin`);
  if (value.expectedAmountValue != null) amountValue(value.expectedAmountValue, `${name}.expectedAmountValue`);

  if (value.ceremony === "secure_payment_confirmation") {
    if (value.expectedTopOrigin == null) throw new Error(`${name}.expectedTopOrigin is required for secure_payment_confirmation`);
    if (value.expectedAmountValue == null) throw new Error(`${name}.expectedAmountValue is required for secure_payment_confirmation`);
    if (value.expectedPayeeName == null && value.expectedPayeeOrigin == null) {
      throw new Error(`${name} requires expectedPayeeName or expectedPayeeOrigin for secure_payment_confirmation`);
    }
  }

  if (value.userVerification !== "required") throw new Error(`${name}.userVerification must be required`);
  mustBeTrue(value.oneTimeUse, `${name}.oneTimeUse`);
  iso(value.createdAt, `${name}.createdAt`);
  iso(value.expiresAt, `${name}.expiresAt`);
  assertChronology(value.createdAt, value.expiresAt, `${name}.createdAt/expiresAt`);
  mustBeFalse(value.rawBiometricDataIncluded, `${name}.rawBiometricDataIncluded`);
  mustBeFalse(value.biometricTemplateIncluded, `${name}.biometricTemplateIncluded`);
  mustBeFalse(value.secretMaterialIncluded, `${name}.secretMaterialIncluded`);
  return value;
}

export function createBiometricPaymentChallenge({
  challengeId,
  paymentIntentId,
  subjectId,
  tenantId,
  credentialId,
  ceremony = "webauthn",
  challengeB64u,
  challengeDigest,
  paymentContextDigest,
  payeeId,
  amountMinor,
  currency: currencyCode,
  purposeCode,
  rpId: relyingPartyId,
  expectedOrigin,
  expectedTopOrigin = null,
  expectedPayeeName = null,
  expectedPayeeOrigin = null,
  expectedAmountValue = null,
  createdAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  return finalize({
    ...header("BiometricPaymentChallenge"),
    challengeId,
    paymentIntentId,
    subjectId,
    tenantId,
    credentialId,
    ceremony,
    challengeB64u,
    challengeDigest,
    paymentContextDigest,
    paymentContext: {
      payeeId,
      amountMinor,
      currency: currencyCode,
      purposeCode,
    },
    rpId: relyingPartyId,
    expectedOrigin,
    expectedTopOrigin,
    expectedPayeeName,
    expectedPayeeOrigin,
    expectedAmountValue,
    userVerification: "required",
    oneTimeUse: true,
    createdAt,
    expiresAt,
    rawBiometricDataIncluded: false,
    biometricTemplateIncluded: false,
    secretMaterialIncluded: false,
  }, assertBiometricPaymentChallengeContract);
}

export function assertBiometricPaymentProofContract(value, name = "biometricPaymentProof") {
  assertHeader(value, "BiometricPaymentProof", name);
  id(value.proofId, `${name}.proofId`);
  id(value.challengeId, `${name}.challengeId`);
  id(value.paymentIntentId, `${name}.paymentIntentId`);
  id(value.authenticationId, `${name}.authenticationId`);
  id(value.subjectId, `${name}.subjectId`);
  id(value.tenantId, `${name}.tenantId`);
  id(value.credentialId, `${name}.credentialId`);
  digest(value.assertionDigest, `${name}.assertionDigest`);
  digest(value.paymentContextDigest, `${name}.paymentContextDigest`);
  mustBeTrue(value.userVerified, `${name}.userVerified`);
  if (value.verificationClass !== "local_user_verification") {
    throw new Error(`${name}.verificationClass must be local_user_verification`);
  }
  optionalVerificationMethodHint(value.localVerificationMethodHint, `${name}.localVerificationMethodHint`);
  mustBeFalse(value.methodHintAuthoritative, `${name}.methodHintAuthoritative`);
  mustBeTrue(value.replayCheckPassed, `${name}.replayCheckPassed`);
  iso(value.verifiedAt, `${name}.verifiedAt`);
  mustBeFalse(value.rawBiometricDataIncluded, `${name}.rawBiometricDataIncluded`);
  mustBeFalse(value.biometricTemplateIncluded, `${name}.biometricTemplateIncluded`);
  mustBeFalse(value.secretMaterialIncluded, `${name}.secretMaterialIncluded`);
  return value;
}

export function createBiometricPaymentProof({
  proofId,
  challengeId,
  paymentIntentId,
  authenticationId,
  subjectId,
  tenantId,
  credentialId,
  assertionDigest,
  paymentContextDigest,
  localVerificationMethodHint = "unknown",
  verifiedAt = new Date().toISOString(),
} = {}) {
  return finalize({
    ...header("BiometricPaymentProof"),
    proofId,
    challengeId,
    paymentIntentId,
    authenticationId,
    subjectId,
    tenantId,
    credentialId,
    assertionDigest,
    paymentContextDigest,
    userVerified: true,
    verificationClass: "local_user_verification",
    localVerificationMethodHint,
    methodHintAuthoritative: false,
    replayCheckPassed: true,
    verifiedAt,
    rawBiometricDataIncluded: false,
    biometricTemplateIncluded: false,
    secretMaterialIncluded: false,
  }, assertBiometricPaymentProofContract);
}

export function assertBiometricPaymentCeremony({
  intent,
  challenge,
  proof,
  authenticationContext,
} = {}) {
  assertBiometricPaymentIntentContract(intent, "intent");
  assertBiometricPaymentChallengeContract(challenge, "challenge");
  assertBiometricPaymentProofContract(proof, "proof");
  assertAuthenticationContextContract(authenticationContext, "authenticationContext");

  const same = (left, right, name) => {
    if (left !== right) throw new Error(`${name} must match across the payment ceremony`);
  };

  same(intent.paymentIntentId, challenge.paymentIntentId, "paymentIntentId");
  same(intent.paymentIntentId, proof.paymentIntentId, "paymentIntentId");
  same(intent.subjectId, challenge.subjectId, "subjectId");
  same(intent.subjectId, proof.subjectId, "subjectId");
  same(intent.subjectId, authenticationContext.subjectId, "subjectId");
  same(intent.tenantId, challenge.tenantId, "tenantId");
  same(intent.tenantId, proof.tenantId, "tenantId");
  same(intent.tenantId, authenticationContext.tenantId, "tenantId");
  same(challenge.challengeId, proof.challengeId, "challengeId");
  same(challenge.credentialId, proof.credentialId, "credentialId");
  same(proof.authenticationId, authenticationContext.authenticationId, "authenticationId");
  same(challenge.paymentContextDigest, proof.paymentContextDigest, "paymentContextDigest");
  same(intent.payeeId, challenge.paymentContext.payeeId, "payeeId");
  same(intent.amountMinor, challenge.paymentContext.amountMinor, "amountMinor");
  same(intent.currency, challenge.paymentContext.currency, "currency");
  same(intent.purposeCode, challenge.paymentContext.purposeCode, "purposeCode");

  if (!authenticationContext.methods.includes("passkey")) {
    throw new Error("authenticationContext.methods must include passkey");
  }
  if (authenticationContext.assuranceLevel === "aal1") {
    throw new Error("biometric payment authorization requires aal2 or aal3");
  }

  assertChronology(intent.createdAt, challenge.createdAt, "intent/challenge");
  if (Date.parse(challenge.expiresAt) > Date.parse(intent.expiresAt)) {
    throw new Error("challenge.expiresAt must not exceed intent.expiresAt");
  }
  assertChronology(challenge.createdAt, proof.verifiedAt, "challenge/proof");
  if (Date.parse(proof.verifiedAt) > Date.parse(challenge.expiresAt)) {
    throw new Error("proof.verifiedAt must be within challenge validity");
  }
  if (Date.parse(authenticationContext.authenticatedAt) > Date.parse(proof.verifiedAt)) {
    throw new Error("authenticationContext.authenticatedAt must not be after proof.verifiedAt");
  }
  if (Date.parse(authenticationContext.expiresAt) < Date.parse(proof.verifiedAt)) {
    throw new Error("authenticationContext must be valid when the proof is verified");
  }

  return true;
}
