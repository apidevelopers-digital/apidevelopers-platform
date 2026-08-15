import {
  GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
} from "./global-trust-integrity-backfill-confirmation.mjs";
import {
  GLOBAL_TRUST_INTEGRITY_COLLECTION,
  GLOBAL_TRUST_PROTECTED_COLLECTIONS,
} from "./global-trust-integrity.mjs";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function sourceKey(collection, recordId) {
  return `${collection}\u0000${recordId}`;
}

function timestampOf(value) {
  for (const field of [
    "occurredAt",
    "decidedAt",
    "assessedAt",
    "recordedAt",
    "generatedAt",
    "createdAt",
    "issuedAt",
  ]) {
    const candidate = String(value?.[field] ?? "").trim();
    if (candidate) return candidate;
  }
  return "";
}

function missingRecords(tx, tenantId) {
  const proofKeys = new Set(
    tx.list(GLOBAL_TRUST_INTEGRITY_COLLECTION)
      .map(({ value }) => value)
      .filter((proof) => proof?.tenantId === tenantId)
      .map((proof) => sourceKey(proof.sourceCollection, proof.recordId)),
  );

  const records = [];
  for (const collection of GLOBAL_TRUST_PROTECTED_COLLECTIONS) {
    for (const { id, value } of tx.list(collection)) {
      if (value?.tenantId !== tenantId) continue;
      if (proofKeys.has(sourceKey(collection, id))) continue;
      records.push({
        sourceCollection: collection,
        recordId: id,
        timestamp: timestampOf(value),
        payload: value,
      });
    }
  }

  return records.sort((left, right) =>
    Boolean(left.timestamp) - Boolean(right.timestamp)
      || left.timestamp.localeCompare(right.timestamp)
      || left.sourceCollection.localeCompare(right.sourceCollection)
      || left.recordId.localeCompare(right.recordId)
  );
}

function countsByCollection(records) {
  const counts = Object.fromEntries(
    GLOBAL_TRUST_PROTECTED_COLLECTIONS.map((collection) => [collection, 0]),
  );
  for (const record of records) counts[record.sourceCollection] += 1;
  return Object.freeze(counts);
}

function blockersFrom(verification) {
  return verification.failures.filter(
    (failure) => failure.code !== "source_record_unprotected",
  );
}

export function createGlobalTrustIntegrityBackfillService({
  store,
  integrity,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") throw new TypeError("store.transaction is required");
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (typeof integrity?.verifyTenantInTransaction !== "function") {
    throw new TypeError("integrity.verifyTenantInTransaction is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  function planInTransaction(tx, tenantId) {
    const verification = integrity.verifyTenantInTransaction(tx, { tenantId });
    const missing = missingRecords(tx, tenantId);
    const blockers = blockersFrom(verification);

    return Object.freeze({
      contractType: "GlobalTrustIntegrityBackfillPlan",
      contractVersion: "1.0",
      tenantId,
      ready: blockers.length === 0,
      currentProofCount: verification.proofCount,
      protectedRecordCount: verification.protectedRecordCount,
      missingProofCount: missing.length,
      missingByCollection: countsByCollection(missing),
      blockerCodes: Object.freeze([...new Set(blockers.map(({ code }) => code))].sort()),
      generatedAt: required(now(), "generatedAt"),
      sensitiveContentIncluded: false,
    });
  }

  return Object.freeze({
    async planTenant({ tenantId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const transaction = await store.transaction((tx) =>
        planInTransaction(tx, tenant)
      );
      return transaction.result;
    },

    async applyTenant({ tenantId, confirmation } = {}) {
      const tenant = required(tenantId, "tenantId");
      if (confirmation !== GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION) {
        throw new TypeError("explicit backfill confirmation is required");
      }

      const transaction = await store.transaction((tx) => {
        const before = planInTransaction(tx, tenant);
        if (!before.ready) {
          throw new TypeError(
            `integrity backfill is blocked: ${before.blockerCodes.join(",")}`,
          );
        }

        const records = missingRecords(tx, tenant);
        for (const record of records) {
          integrity.appendInTransaction(tx, {
            tenantId: tenant,
            sourceCollection: record.sourceCollection,
            recordId: record.recordId,
            payload: record.payload,
          });
        }

        const verification = integrity.verifyTenantInTransaction(tx, { tenantId: tenant });
        if (!verification.valid) {
          throw new TypeError("integrity backfill verification failed");
        }

        return Object.freeze({
          contractType: "GlobalTrustIntegrityBackfillExecution",
          contractVersion: "1.0",
          tenantId: tenant,
          appliedProofCount: records.length,
          appliedByCollection: countsByCollection(records),
          proofCount: verification.proofCount,
          protectedRecordCount: verification.protectedRecordCount,
          verifiedRecordCount: verification.verifiedRecordCount,
          valid: verification.valid,
          executedAt: required(now(), "executedAt"),
          sensitiveContentIncluded: false,
        });
      });

      return transaction.result;
    },
  });
}
