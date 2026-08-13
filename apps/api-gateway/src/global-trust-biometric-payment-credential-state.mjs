const DEFAULT_COLLECTION = "global_trust_biometric_payment_credentials";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function requireStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_STORE_INVALID", "store must implement read and transaction");
  }
  return store;
}

function normalizeCredential(value, name = "credential") {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_INPUT", `${name} must be an object`);
  }
  const signCount = Number(value.signCount ?? 0);
  if (!Number.isSafeInteger(signCount) || signCount < 0) {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_SIGN_COUNT", `${name}.signCount must be a non-negative safe integer`);
  }
  const algorithm = Number(value.algorithm);
  if (!Number.isInteger(algorithm)) {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_ALGORITHM", `${name}.algorithm must be an integer`);
  }
  if (!value.publicKeyJwk || typeof value.publicKeyJwk !== "object" || Array.isArray(value.publicKeyJwk)) {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_PUBLIC_KEY", `${name}.publicKeyJwk must be an object`);
  }
  return Object.freeze({
    credentialId: required(value.credentialId, `${name}.credentialId`),
    subjectId: required(value.subjectId, `${name}.subjectId`),
    tenantId: required(value.tenantId, `${name}.tenantId`),
    status: required(value.status ?? "active", `${name}.status`),
    credentialType: required(value.credentialType ?? "passkey", `${name}.credentialType`),
    assuranceLevel: required(value.assuranceLevel ?? "aal2", `${name}.assuranceLevel`),
    algorithm,
    publicKeyJwk: structuredClone(value.publicKeyJwk),
    signCount,
    paymentCredential: value.paymentCredential === true,
    backupEligible: value.backupEligible === true,
    createdAt: value.createdAt == null ? null : required(value.createdAt, `${name}.createdAt`),
    updatedAt: value.updatedAt == null ? null : required(value.updatedAt, `${name}.updatedAt`),
  });
}

function keyFor({ tenantId, subjectId, credentialId }) {
  return `${required(tenantId, "tenantId")}::${required(subjectId, "subjectId")}::${required(credentialId, "credentialId")}`;
}

function recordFromState(state, collection, key) {
  return state?.collections?.[collection]?.[key] ?? null;
}

export function createPersistentBiometricPaymentCredentialState({
  store: storeInput,
  collectionName = DEFAULT_COLLECTION,
  durability = null,
  now = () => new Date().toISOString(),
} = {}) {
  const store = requireStore(storeInput);
  const collection = required(collectionName, "collectionName");
  const normalizedDurability = durability ?? (store.kind === "postgres" ? "durable" : "development");
  if (!["durable", "development"].includes(normalizedDurability)) {
    fail("TRUST_PAYMENT_CREDENTIAL_STATE_DURABILITY_INVALID", "durability must be durable or development");
  }

  async function register(input) {
    const credential = normalizeCredential({
      ...input,
      createdAt: input?.createdAt ?? now(),
      updatedAt: input?.updatedAt ?? now(),
    });
    const key = keyFor(credential);
    try {
      await store.transaction(async (tx) => {
        if (tx.get(collection, key)) {
          fail("TRUST_PAYMENT_CREDENTIAL_EXISTS", "credential already exists");
        }
        tx.put(collection, key, credential, { ifAbsent: true });
        return true;
      });
    } catch (error) {
      if (error?.code === "record_conflict") {
        fail("TRUST_PAYMENT_CREDENTIAL_EXISTS", "credential already exists");
      }
      throw error;
    }
    return credential;
  }

  async function resolve({ credentialId, subjectId, tenantId } = {}) {
    const key = keyFor({ credentialId, subjectId, tenantId });
    const state = await store.read();
    const credential = recordFromState(state, collection, key);
    return credential ? normalizeCredential(credential, "storedCredential") : null;
  }

  async function append(update = {}) {
    const key = keyFor(update);
    const previousSignCount = Number(update.previousSignCount);
    const newSignCount = Number(update.newSignCount);
    if (!Number.isSafeInteger(previousSignCount) || previousSignCount < 0) {
      fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_SIGN_COUNT", "previousSignCount must be a non-negative safe integer");
    }
    if (!Number.isSafeInteger(newSignCount) || newSignCount < 0) {
      fail("TRUST_PAYMENT_CREDENTIAL_STATE_INVALID_SIGN_COUNT", "newSignCount must be a non-negative safe integer");
    }
    if (newSignCount > 0 && newSignCount <= previousSignCount) {
      fail("TRUST_PAYMENT_CREDENTIAL_SIGN_COUNT_REPLAY", "newSignCount must advance when authenticator counter is non-zero");
    }

    const txResult = await store.transaction(async (tx) => {
      const current = tx.get(collection, key);
      if (!current) fail("TRUST_PAYMENT_CREDENTIAL_NOT_FOUND", "credential was not found");
      const normalized = normalizeCredential(current, "storedCredential");
      if (normalized.signCount !== previousSignCount) {
        fail("TRUST_PAYMENT_CREDENTIAL_STATE_CONFLICT", "stored signCount changed before verification state could be persisted");
      }
      const updated = Object.freeze({
        ...normalized,
        signCount: newSignCount,
        updatedAt: required(update.verifiedAt ?? now(), "verifiedAt"),
      });
      tx.put(collection, key, updated);
      return updated;
    });
    return txResult.result;
  }

  return Object.freeze({
    durability: normalizedDurability,
    backend: store.kind ?? "unknown",
    register,
    resolve,
    append,
  });
}
