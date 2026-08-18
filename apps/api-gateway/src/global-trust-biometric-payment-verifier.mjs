import {
  assertBiometricPaymentChallengeContract,
  assertBiometricPaymentIntentContract,
} from "@apidevelopers/contracts";
import {
  createHash,
  createPublicKey,
  verify as verifySignature,
} from "node:crypto";

const ES256 = -7;
const RS256 = -257;
const SUPPORTED_ALGORITHMS = new Set([ES256, RS256]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  if (value == null || String(value).trim() === "") fail("TRUST_PAYMENT_INVALID_INPUT", `${name} is required`);
  return String(value).trim();
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_INVALID_INPUT", `${name} must be an object`);
  }
  return value;
}

function b64u(value, name) {
  const normalized = required(value, name);
  if (!/^[A-Za-z0-9_-]+$/.test(normalized)) fail("TRUST_PAYMENT_INVALID_BASE64URL", `${name} must be base64url`);
  try {
    return Buffer.from(normalized, "base64url");
  } catch {
    fail("TRUST_PAYMENT_INVALID_BASE64URL", `${name} must be base64url`);
  }
}

export function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function constantHexEqual(left, right) {
  const a = Buffer.from(left, "hex");
  const b = Buffer.from(right, "hex");
  return a.length === b.length && a.equals(b);
}

function canonicalPaymentContext(intent) {
  assertBiometricPaymentIntentContract(intent);
  return JSON.stringify([
    "global-trust-biometric-payment-context-v1",
    intent.tenantId,
    intent.subjectId,
    intent.paymentIntentId,
    intent.payeeId,
    intent.amountMinor,
    intent.currency,
    intent.purposeCode,
  ]);
}

export function createPaymentContextDigest(intent) {
  return sha256(Buffer.from(canonicalPaymentContext(intent), "utf8"));
}

export function normalizeBiometricPaymentCredential(value) {
  const credential = assertObject(value, "credential");
  const normalized = {
    credentialId: required(credential.credentialId, "credential.credentialId"),
    subjectId: required(credential.subjectId, "credential.subjectId"),
    tenantId: required(credential.tenantId, "credential.tenantId"),
    status: required(credential.status, "credential.status"),
    credentialType: required(credential.credentialType, "credential.credentialType"),
    assuranceLevel: required(credential.assuranceLevel, "credential.assuranceLevel"),
    algorithm: Number(credential.algorithm),
    publicKeyJwk: assertObject(credential.publicKeyJwk, "credential.publicKeyJwk"),
    signCount: Number(credential.signCount ?? 0),
    paymentCredential: credential.paymentCredential === true,
    backupEligible: credential.backupEligible === true,
  };
  if (normalized.status !== "active") fail("TRUST_PAYMENT_CREDENTIAL_INACTIVE", "credential must be active");
  if (normalized.credentialType !== "passkey") fail("TRUST_PAYMENT_CREDENTIAL_TYPE", "credential must be a passkey");
  if (!["aal2", "aal3"].includes(normalized.assuranceLevel)) {
    fail("TRUST_PAYMENT_ASSURANCE_TOO_LOW", "credential assuranceLevel must be aal2 or aal3");
  }
  if (!SUPPORTED_ALGORITHMS.has(normalized.algorithm)) {
    fail("TRUST_PAYMENT_ALGORITHM_UNSUPPORTED", "credential algorithm must be ES256 or RS256");
  }
  if (!Number.isInteger(normalized.signCount) || normalized.signCount < 0) {
    fail("TRUST_PAYMENT_INVALID_SIGN_COUNT", "credential.signCount must be a non-negative integer");
  }
  return Object.freeze(normalized);
}

function parseClientData(assertion) {
  const bytes = b64u(assertion.clientDataJSONB64u, "assertion.clientDataJSONB64u");
  let clientData;
  try {
    clientData = JSON.parse(bytes.toString("utf8"));
  } catch {
    fail("TRUST_PAYMENT_CLIENT_DATA_INVALID", "clientDataJSON must contain valid JSON");
  }
  return { bytes, clientData: assertObject(clientData, "clientData") };
}

function parseAuthenticatorData(assertion) {
  const bytes = b64u(assertion.authenticatorDataB64u, "assertion.authenticatorDataB64u");
  if (bytes.length < 37) fail("TRUST_PAYMENT_AUTHENTICATOR_DATA_INVALID", "authenticatorData must be at least 37 bytes");
  return {
    bytes,
    rpIdHash: bytes.subarray(0, 32),
    flags: bytes[32],
    signCount: bytes.readUInt32BE(33),
  };
}

function assertSpcClientData(clientData, challenge) {
  const payment = assertObject(clientData.payment, "clientData.payment");
  if (payment.rpId !== challenge.rpId) {
    fail("TRUST_PAYMENT_SPC_RPID_MISMATCH", "SPC payment.rpId does not match the challenge");
  }
  if (payment.rp != null && payment.rp !== payment.rpId) {
    fail("TRUST_PAYMENT_SPC_RP_ALIAS_MISMATCH", "SPC payment.rp must equal payment.rpId when present");
  }
  if (payment.topOrigin !== challenge.expectedTopOrigin) {
    fail("TRUST_PAYMENT_SPC_TOP_ORIGIN_MISMATCH", "SPC payment.topOrigin does not match the challenge");
  }
  if (challenge.expectedPayeeName != null && payment.payeeName !== challenge.expectedPayeeName) {
    fail("TRUST_PAYMENT_SPC_PAYEE_NAME_MISMATCH", "SPC payment.payeeName does not match the challenge");
  }
  if (challenge.expectedPayeeOrigin != null && payment.payeeOrigin !== challenge.expectedPayeeOrigin) {
    fail("TRUST_PAYMENT_SPC_PAYEE_ORIGIN_MISMATCH", "SPC payment.payeeOrigin does not match the challenge");
  }

  const total = assertObject(payment.total, "clientData.payment.total");
  if (total.currency !== challenge.paymentContext.currency) {
    fail("TRUST_PAYMENT_SPC_CURRENCY_MISMATCH", "SPC total.currency does not match the challenge");
  }
  if (String(total.value) !== challenge.expectedAmountValue) {
    fail("TRUST_PAYMENT_SPC_AMOUNT_MISMATCH", "SPC total.value does not match the challenge");
  }
}

export function verifyBiometricPaymentAssertion({
  assertion,
  credential: credentialInput,
  challenge,
} = {}) {
  assertBiometricPaymentChallengeContract(challenge);
  const credential = normalizeBiometricPaymentCredential(credentialInput);
  const normalizedAssertion = assertObject(assertion, "assertion");

  const assertionCredentialId = required(normalizedAssertion.credentialId, "assertion.credentialId");
  if (assertionCredentialId !== challenge.credentialId || assertionCredentialId !== credential.credentialId) {
    fail("TRUST_PAYMENT_CREDENTIAL_MISMATCH", "assertion credential does not match the challenge");
  }
  if (credential.subjectId !== challenge.subjectId || credential.tenantId !== challenge.tenantId) {
    fail("TRUST_PAYMENT_CREDENTIAL_SCOPE_MISMATCH", "credential subject or tenant does not match the challenge");
  }
  if (challenge.ceremony === "secure_payment_confirmation" && credential.paymentCredential !== true) {
    fail("TRUST_PAYMENT_SPC_CREDENTIAL_REQUIRED", "secure payment confirmation requires a payment-enabled credential");
  }

  const challengeBytes = b64u(challenge.challengeB64u, "challenge.challengeB64u");
  if (!constantHexEqual(sha256(challengeBytes), challenge.challengeDigest)) {
    fail("TRUST_PAYMENT_CHALLENGE_DIGEST_MISMATCH", "challenge digest does not match challenge bytes");
  }

  const { bytes: clientDataBytes, clientData } = parseClientData(normalizedAssertion);
  const expectedType = challenge.ceremony === "secure_payment_confirmation" ? "payment.get" : "webauthn.get";
  if (clientData.type !== expectedType) {
    fail("TRUST_PAYMENT_CLIENT_DATA_TYPE_MISMATCH", `clientData.type must be ${expectedType}`);
  }
  if (clientData.challenge !== challenge.challengeB64u) {
    fail("TRUST_PAYMENT_CHALLENGE_MISMATCH", "clientData.challenge does not match the issued challenge");
  }
  if (clientData.origin !== challenge.expectedOrigin) {
    fail("TRUST_PAYMENT_ORIGIN_MISMATCH", "clientData.origin does not match the expected origin");
  }
  if (clientData.crossOrigin === true && challenge.ceremony !== "secure_payment_confirmation") {
    fail("TRUST_PAYMENT_CROSS_ORIFIN_REJECTED", "cross-origin WebAuthn payment assertion is not allowed outside SPC");
  }
  if (challenge.ceremony === "secure_payment_confirmation") {
    assertSpcClientData(clientData, challenge);
  }

  const authData = parseAuthenticatorData(normalizedAssertion);
  const expectedRpIdHash = createHash("sha256").update(challenge.rpId, "utf8").digest();
  if (!authData.rpIdHash.equals(expectedRpIdHash)) {
    fail("TRUST_PAYMENT_RPID_HASH_MISMATCH", "authenticator rpIdHash does not match the relying party");
  }

  const userPresent = (authData.flags & 0x01) !== 0;
  const userVerified = (authData.flags & 0x04) !== 0;
  if (!userPresent) fail("TRUST_PAYMENT_USER_PRESENCE_REQUIRED", "authenticator user-presence flag is required");
  if (!userVerified) fail("TRUST_PAYMENT_USER_VERIFICATION_REQUIRED", "authenticator user-verification flag is required");

  const signature = b64u(normalizedAssertion.signatureB64u, "assertion.signatureB64u");
  const clientDataHash = createHash("sha256").update(clientDataBytes).digest();
  const signedBytes = Buffer.concat([authData.bytes, clientDataHash]);

  let publicKey;
  try {
    publicKey = createPublicKey({ key: credential.publicKeyJwk, format: "jwk" });
  } catch {
    fail("TRUST_PAYMENT_PUBLIC_KEY_INVALID", "credential public key could not be loaded");
  }
  const validSignature = verifySignature("sha256", signedBytes, publicKey, signature);
  if (!validSignature) fail("TRUST_PAYMENT_SIGNATURE_INVALID", "WebAuthn/SPC assertion signature is invalid");

  if (credential.signCount > 0 && authData.signCount > 0 && authData.signCount <= credential.signCount) {
    fail("TRUST_PAYMENT_SIGN_COUNT_REPLAY", "authenticator signCount did not advance");
  }

  const assertionDigest = sha256(Buffer.concat([
    Buffer.from(assertionCredentialId, "utf8"),
    clientDataBytes,
    authData.bytes,
    signature,
  ]));

  return Object.freeze({
    verified: true,
    assertionDigest,
    credentialId: credential.credentialId,
    newSignCount: authData.signCount,
    userPresent,
    userVerified,
    clientDataType: clientData.type,
    ceremony: challenge.ceremony,
  });
}

