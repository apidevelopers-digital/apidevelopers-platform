import {
  createPostgresStore,
} from "@apidevelopers/persistence-core";
import {
  assertBiometricPaymentChallengeContract,
} from "@apidevelopers/contracts";

const COLLECTION = "global_trust_biometric_payment_challenges";

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_PAYMENT_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function requireStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    fail("TRUST_PAYMENT_PERSISTENCE_STORE_INVALID", "store must implement read and transaction");
  }
  return store;
}

function mapPersistenceError(error) {
  if (error?.code === "record_conflict") {
    fail("TRUST_PAYMENT_CHALLENGE_EXISTS", "challenge already exists");
  }
  if (["persistence_retryable_conflict", "persistence_revision_conflict"].includes(error?.code)) {
    fail("TRUST_PAYMENT_PERSISTENCE_CONFLICT", "challenge store transaction conflicted and may be retried");
  }
  throw error;
}

function recordFromState(state, collectionName, challengeId) {
  return state?.collections?.[collectionName]?.[challengeId] ?? null;
}

export function createPersistentBiometricPaymentChallengeStore({
  store: storeInput,
  collectionName = COLLECTION,
  durability = null,
} = {}) {
  const store = requireStore(storeInput);
  const collection = required(collectionName, "collectionName");
  const normalizedDurability = durability ?? ((store.kind === "postgres") ? "durable" : "development");
  if (!["durable", "development"].includes(normalizedDurability)) {
    fail("TRUST_PAYMENT_PERSISTENCE_DURABILITY_INVALID", "durability must be durable or development");
  }

  return Object.freeze({
    durability: normalizedDurability,
    backend: store.kind ?? "unknown",

    async issue(challenge) {
      assertBiometricPaymentChallengeContract(challenge);
      try {
        await store.transaction(async (tx) => {
          if (tx.get(collection, challenge.challengeId)) {
            fail("TRUST_PAYMENT_CHALLENGE_EXISTS", "challenge already exists");
          }
          tx.put(collection, challenge.challengeId, {
            challenge,
            consumedAt: null,
          }, { ifAbsent: true });
          return { issued: true };
        });
      } catch (error) {
        mapPersistenceError(error);
      }
      return challenge;
    },

    async get(challengeId) {
      const id = required(challengeId, "challengeId");
      const state = await store.read();
      return recordFromState(state, collection, id)?.challenge ?? null;
    },

    async consume({
      challengeId,
      challengeDigest,
      now = new Date().toISOString(),
    } = {}) {
      const id = required(challengeId, "challengeId");
      const digest = required(challengeDigest, "challengeDigest");
      try {
        const persisted = await store.transaction(async (tx) => {
          const record = tx.get(collection, id);
          if (!record) fail("TRUST_PAYMENT_CHALLENGE_NOT_FOUND", "challenge was not found");
          if (record.consumedAt != null) fail("TRUST_PAYMENT_REPLAY_BLOCKED", "challenge was already consumed");
          if (record.challenge.challengeDigest !== digest) {
            fail("TRUST_PAYMENT_CHALLENGE_DIGEST_MISMATCH", "challenge digest does not match the stored challenge");
          }
          if (Date.parse(now) > Date.parse(record.challenge.expiresAt)) {
            fail("TRUST_PAYMENT_CHALLENGE_EXPIRED", "challenge has expired");
          }
          const updated = {
            ...record,
            consumedAt: now,
          };
          tx.put(collection, id, updated);
          return { consumed: true, consumedAt: now };
        });
        return persisted.result;
      } catch (error) {
        mapPersistenceError(error);
      }
    },
  });
}

export function createPostgresBiometricPaymentChallengeStore({
  pool,
  namespace = "global-trust-biometric-payments",
  schema = "public",
  tableName = "apidev_persistence_state",
  clock,
} = {}) {
  const store = createPostgresStore({
    pool,
    namespace,
    schema,
    tableName,
    clock,
  });
  return createPersistentBiometricPaymentChallengeStore({
    store,
    durability: "durable",
  });
}
