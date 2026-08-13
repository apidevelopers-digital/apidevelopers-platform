import { createHash, randomUUID } from "node:crypto";

const TERMINAL = new Set(["authorized", "declined"]);
const RECONCILABLE = new Set(["submitting", "pending", "indeterminate"]);

function fail(code, message) {
  const error = new Error(message);
  error.code = code;
  throw error;
}

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) fail("TRUST_PAYMENT_EXECUTION_INVALID_INPUT", `${name} is required`);
  return normalized;
}

function object(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("TRUST_PAYMENT_EXECUTION_INVALID_INPUT", `${name} must be an object`);
  }
  return value;
}

function iso(value, name) {
  const normalized = required(value, name);
  if (Number.isNaN(Date.parse(normalized))) {
    fail("TRUST_PAYMENT_EXECUTION_INVALID_INPUT", `${name} must be ISO-8601`);
  }
  return normalized;
}

function canonicalRequest(request) {
  const value = object(request, "request");
  const amountMinor = Number(value.amountMinor);
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    fail("TRUST_PAYMENT_EXECUTION_INVALID_INPUT", "request.amountMinor must be a positive safe integer");
  }
  return Object.freeze({
    paymentIntentId: required(value.paymentIntentId, "request.paymentIntentId"),
    subjectId: required(value.subjectId, "request.subjectId"),
    tenantId: required(value.tenantId, "request.tenantId"),
    payeeId: required(value.payeeId, "request.payeeId"),
    amountMinor,
    currency: required(value.currency, "request.currency"),
    purposeCode: required(value.purposeCode, "request.purposeCode"),
    proofId: required(value.proofId, "request.proofId"),
    authorizationDecisionId: required(value.authorizationDecisionId, "request.authorizationDecisionId"),
    idempotencyKey: required(value.idempotencyKey ?? value.paymentIntentId, "request.idempotencyKey"),
  });
}

function digestRequest(request) {
  const canonical = canonicalRequest(request);
  const ordered = [
    "global-trust-biometric-payment-execution-v1",
    canonical.paymentIntentId,
    canonical.subjectId,
    canonical.tenantId,
    canonical.payeeId,
    canonical.amountMinor,
    canonical.currency,
    canonical.purposeCode,
    canonical.proofId,
    canonical.authorizationDecisionId,
    canonical.idempotencyKey,
  ];
  return createHash("sha256").update(JSON.stringify(ordered), "utf8").digest("hex");
}

function requireStore(store) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    fail("TRUST_PAYMENT_EXECUTION_STORE_INVALID", "execution store must implement read and transaction");
  }
  return store;
}

function requireProvider(provider) {
  const normalized = object(provider, "provider");
  if (!["sandbox", "external"].includes(normalized.mode)) {
    fail("TRUST_PAYMENT_PROVIDER_INVALID", "provider.mode must be sandbox or external");
  }
  if (normalized.idempotencyGuaranteed !== true) {
    fail("TRUST_PAYMENT_PROVIDER_IDEMPOTENCY_REQUIRED", "provider must guarantee idempotency by idempotencyKey");
  }
  if (typeof normalized.authorize !== "function") {
    fail("TRUST_PAYMENT_PROVIDER_INVALID", "provider.authorize must be a function");
  }
  if (normalized.mode === "external" && typeof normalized.getStatus !== "function") {
    fail("TRUST_PAYMENT_PROVIDER_RECONCILIATION_REQUIRED", "external provider must implement getStatus");
  }
  return normalized;
}

function recordFromState(state, collection, idempotencyKey) {
  return state?.collections?.[collection]?.[idempotencyKey] ?? null;
}

function normalizeProviderResult(value, providerMode) {
  const result = object(value, "provider result");
  if (!["authorized", "declined", "pending"].includes(result.status)) {
    fail("TRUST_PAYMENT_PROVIDER_INVALID_RESPONSE", "provider status must be authorized, declined, or pending");
  }
  const providerReference = required(result.providerReference, "provider result.providerReference");
  return Object.freeze({
    status: result.status,
    providerReference,
    providerCode: result.providerCode == null ? null : String(result.providerCode),
    providerMode,
  });
}

export function createSandboxBiometricPaymentProvider({
  behavior = "authorized",
  providerName = "sandbox",
} = {}) {
  if (!["authorized", "declined", "pending"].includes(behavior)) {
    fail("TRUST_PAYMENT_SANDBOX_INVALID", "sandbox behavior must be authorized, declined, or pending");
  }
  const statuses = new Map();
  return Object.freeze({
    mode: "sandbox",
    name: providerName,
    idempotencyGuaranteed: true,
    financialExecutionCapable: false,

    async authorize({ idempotencyKey }) {
      const key = required(idempotencyKey, "idempotencyKey");
      const existing = statuses.get(key);
      if (existing) return existing;
      const result = Object.freeze({
        status: behavior,
        providerReference: `sandbox.${createHash("sha256").update(key).digest("hex").slice(0, 24)}`,
        providerCode: behavior === "authorized" ? "SANDBOX_APPROVED" : behavior === "declined" ? "SANDBOX_DECLINED" : "SANDBOX_PENDING",
      });
      statuses.set(key, result);
      return result;
    },

    async getStatus({ idempotencyKey }) {
      const key = required(idempotencyKey, "idempotencyKey");
      return statuses.get(key) ?? Object.freeze({
        status: "pending",
        providerReference: `sandbox.${createHash("sha256").update(key).digest("hex").slice(0, 24)}`,
        providerCode: "SANDBOX_PENDING",
      });
    },
  });
}

export function createBiometricPaymentExecutionAdapter({
  store: storeInput,
  provider: providerInput,
  durability = null,
  externalExecutionApproved = false,
  collectionName = "global_trust_biometric_payment_executions",
  leaseMs = 30_000,
  now = () => new Date().toISOString(),
  idFactory = randomUUID,
} = {}) {
  const store = requireStore(storeInput);
  const provider = requireProvider(providerInput);
  const collection = required(collectionName, "collectionName");
  const normalizedDurability = durability ?? (store.kind === "postgres" ? "durable" : "development");
  if (!["durable", "development"].includes(normalizedDurability)) {
    fail("TRUST_PAYMENT_EXECUTION_DURABILITY_INVALID", "durability must be durable or development");
  }
  if (!Number.isSafeInteger(leaseMs) || leaseMs < 1_000 || leaseMs > 300_000) {
    fail("TRUST_PAYMENT_EXECUTION_LEASE_INVALID", "leaseMs must be between 1000 and 300000");
  }
  if (provider.mode === "external" && externalExecutionApproved !== true) {
    fail("TRUST_PAYMENT_EXTERNAL_EXECUTION_BLOCKED", "external financial execution requires explicit approval");
  }
  if (provider.mode === "external" && normalizedDurability !== "durable") {
    fail("TRUST_PAYMENT_EXECUTION_DURABLE_STORE_REQUIRED", "external financial execution requires durable execution state");
  }

  async function getRecord(idempotencyKey) {
    const key = required(idempotencyKey, "idempotencyKey");
    return recordFromState(await store.read(), collection, key);
  }

  async function reserve(request) {
    const canonical = canonicalRequest(request);
    const requestDigest = digestRequest(canonical);
    const timestamp = iso(now(), "now");
    const leaseExpiresAt = new Date(Date.parse(timestamp) + leaseMs).toISOString();

    const txResult = await store.transaction(async (tx) => {
      const existing = tx.get(collection, canonical.idempotencyKey);

      if (existing) {
        if (existing.requestDigest !== requestDigest) {
          fail("TRUST_PAYMENT_IDEMPOTENCY_CONFLICT", "idempotencyKey is already bound to a different payment request");
        }
        if (TERMINAL.has(existing.status) || existing.status === "pending") {
          return { shouldSubmit: false, record: existing };
        }
        if (existing.status === "submitting" && Date.parse(existing.leaseExpiresAt) > Date.parse(timestamp)) {
          return { shouldSubmit: false, record: existing };
        }
      }

      const attemptId = idFactory();
      const record = Object.freeze({
        type: "BiometricPaymentExecution",
        version: "1.0.0",
        paymentIntentId: canonical.paymentIntentId,
        idempotencyKey: canonical.idempotencyKey,
        requestDigest,
        subjectId: canonical.subjectId,
        tenantId: canonical.tenantId,
        payeeId: canonical.payeeId,
        amountMinor: canonical.amountMinor,
        currency: canonical.currency,
        purposeCode: canonical.purposeCode,
        proofId: canonical.proofId,
        authorizationDecisionId: canonical.authorizationDecisionId,
        providerMode: provider.mode,
        providerName: String(provider.name ?? "unnamed"),
        status: "submitting",
        attemptId,
        leaseExpiresAt,
        providerReference: existing?.providerReference ?? null,
        providerCode: existing?.providerCode ?? null,
        createdAt: existing?.createdAt ?? timestamp,
        updatedAt: timestamp,
      });
      tx.put(collection, canonical.idempotencyKey, record);
      return { shouldSubmit: true, record };
    });

    return txResult.result;
  }

  async function finalize({ request, attemptId, providerResult, statusOverride = null }) {
    const canonical = canonicalRequest(request);
    const requestDigest = digestRequest(canonical);
    const timestamp = iso(now(), "now");

    const txResult = await store.transaction(async (tx) => {
      const existing = tx.get(collection, canonical.idempotencyKey);
      if (!existing) fail("TRUST_PAYMENT_EXECUTION_NOT_FOUND", "payment execution reservation was not found");
      if (existing.requestDigest !== requestDigest) {
        fail("TRUST_PAYMENT_IDEMPOTENCY_CONFLICT", "execution request digest changed during provider call");
      }
      if (existing.attemptId !== attemptId) {
        fail("TRUST_PAYMENT_EXECUTION_STALE_ATTEMPT", "provider result belongs to a stale execution attempt");
      }

      const result = providerResult ? normalizeProviderResult(providerResult, provider.mode) : null;
      const status = statusOverride ?? result?.status;
      const record = Object.freeze({
        ...existing,
        status,
        providerReference: result?.providerReference ?? existing.providerReference,
        providerCode: result?.providerCode ?? existing.providerCode,
        leaseExpiresAt: null,
        updatedAt: timestamp,
      });
      tx.put(collection, canonical.idempotencyKey, record);
      return record;
    });
    return txResult.result;
  }

  async function submit(request) {
    const canonical = canonicalRequest(request);
    const reservation = await reserve(canonical);
    if (!reservation.shouldSubmit) {
      return Object.freeze({
        ...reservation.record,
        providerContactOccurred: false,
        financialExecutionOccurred: false,
        cached: true,
      });
    }

    try {
      const providerResult = await provider.authorize({
        ...canonical,
        idempotencyKey: canonical.idempotencyKey,
      });
      const record = await finalize({
        request: canonical,
        attemptId: reservation.record.attemptId,
        providerResult,
      });
      return Object.freeze({
        ...record,
        providerContactOccurred: true,
        financialExecutionOccurred: provider.mode === "external",
        cached: false,
      });
    } catch (error) {
      try {
        await finalize({
          request: canonical,
          attemptId: reservation.record.attemptId,
          statusOverride: "indeterminate",
        });
      } catch {
        // Preserve the provider failure. Reconciliation remains possible from durable state.
      }
      const wrapped = new Error("payment provider authorization became indeterminate");
      wrapped.code = "TRUST_PAYMENT_PROVIDER_INDETERMINATE";
      wrapped.cause = error;
      throw wrapped;
    }
  }

  async function reconcile({ idempotencyKey } = {}) {
    const key = required(idempotencyKey, "idempotencyKey");
    const existing = await getRecord(key);
    if (!existing) fail("TRUST_PAYMENT_EXECUTION_NOT_FOUND", "payment execution was not found");
    if (TERMINAL.has(existing.status)) return existing;
    if (!RECONCILABLE.has(existing.status)) return existing;
    if (typeof provider.getStatus !== "function") {
      fail("TRUST_PAYMENT_PROVIDER_RECONCILIATION_UNAVAILABLE", "provider does not support reconciliation");
    }

    const result = normalizeProviderResult(await provider.getStatus({
      idempotencyKey: key,
      providerReference: existing.providerReference,
      paymentIntentId: existing.paymentIntentId,
    }), provider.mode);

    const timestamp = iso(now(), "now");
    const txResult = await store.transaction(async (tx) => {
      const current = tx.get(collection, key);
      if (!current) fail("TRUST_PAYMENT_EXECUTION_NOT_FOUND", "payment execution was not found");
      if (current.requestDigest !== existing.requestDigest) {
        fail("TRUST_PAYMENT_IDEMPOTENCY_CONFLICT", "execution changed before reconciliation");
      }
      const record = Object.freeze({
        ...current,
        status: result.status,
        providerReference: result.providerReference,
        providerCode: result.providerCode,
        leaseExpiresAt: result.status === "pending" ? current.leaseExpiresAt : null,
        updatedAt: timestamp,
      });
      tx.put(collection, key, record);
      return record;
    });
    return txResult.result;
  }

  return Object.freeze({
    mode: provider.mode === "external" ? "external" : "dry-run",
    providerMode: provider.mode,
    providerName: String(provider.name ?? "unnamed"),
    durability: normalizedDurability,
    idempotencyGuaranteed: true,
    contactEnabled: provider.mode === "external",
    authorize: submit,
    get: getRecord,
    reconcile,
  });
}

export { digestRequest as createBiometricPaymentExecutionDigest };
