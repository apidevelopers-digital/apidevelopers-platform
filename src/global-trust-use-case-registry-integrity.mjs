import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";

export const USE_CASE_REGISTRY_EVENT_COLLECTION =
  "global_trust_use_case_registry_events";
export const USE_CASE_REGISTRY_PROOF_COLLECTION =
  "global_trust_use_case_registry_integrity_proofs";

const GENESIS = "0".repeat(64);

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function proofHash(proof) {
  return sha256Canonical({
    proofId: proof.proofId,
    tenantId: proof.tenantId,
    sequence: proof.sequence,
    sourceCollection: proof.sourceCollection,
    recordId: proof.recordId,
    payloadHash: proof.payloadHash,
    previousProofHash: proof.previousProofHash,
    algorithm: proof.algorithm,
    recordedAt: proof.recordedAt,
  });
}

function tenantProofs(tx, tenantId) {
  return tx.list(USE_CASE_REGISTRY_PROOF_COLLECTION)
    .map(({ value }) => value)
    .filter((proof) => proof?.tenantId === tenantId)
    .sort((left, right) =>
      left.sequence - right.sequence
      || left.proofId.localeCompare(right.proofId)
    );
}

function chainFailures(proofs) {
  const failures = [];
  let previous = GENESIS;

  for (let index = 0; index < proofs.length; index += 1) {
    const proof = proofs[index];
    if (proof.sequence !== index + 1) {
      failures.push({ proofId: proof.proofId, code: "sequence_mismatch" });
    }
    if (proof.previousProofHash !== previous) {
      failures.push({ proofId: proof.proofId, code: "previous_hash_mismatch" });
    }
    if (proof.proofHash !== proofHash(proof)) {
      failures.push({ proofId: proof.proofId, code: "proof_hash_mismatch" });
    }
    previous = String(proof.proofHash ?? "");
  }

  return failures;
}

export function createGlobalTrustUseCaseRegistryIntegrity({
  store,
  proofIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof proofIdFactory !== "function") {
    throw new TypeError("proofIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  function appendInTransaction(tx, {
    tenantId,
    sourceCollection,
    recordId,
    payload,
  } = {}) {
    const tenant = required(tenantId, "tenantId");
    const collection = required(sourceCollection, "sourceCollection");
    const id = required(recordId, "recordId");

    if (collection !== USE_CASE_REGISTRY_EVENT_COLLECTION) {
      throw new TypeError(
        "sourceCollection is not protected by use case registry integrity",
      );
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload must be an object");
    }
    if (required(payload.tenantId, "payload.tenantId") !== tenant) {
      throw new TypeError("payload tenant mismatch");
    }

    const proofs = tenantProofs(tx, tenant);
    if (chainFailures(proofs).length) {
      throw new TypeError("use case registry integrity chain is invalid");
    }
    if (proofs.some((proof) =>
      proof.sourceCollection === collection && proof.recordId === id
    )) {
      throw new TypeError("use case registry integrity proof already exists");
    }

    const proof = {
      contractType: "UseCaseRegistryIntegrityProof",
      contractVersion: "1.0",
      proofId: required(proofIdFactory(), "proofId"),
      tenantId: tenant,
      sequence: proofs.length + 1,
      sourceCollection: collection,
      recordId: id,
      payloadHash: sha256Canonical(payload),
      previousProofHash: proofs.at(-1)?.proofHash ?? GENESIS,
      algorithm: "sha256",
      recordedAt: required(now(), "recordedAt"),
      sensitiveContentIncluded: false,
    };
    proof.proofHash = proofHash(proof);

    tx.put(
      USE_CASE_REGISTRY_PROOF_COLLECTION,
      proof.proofId,
      Object.freeze(proof),
      { ifAbsent: true },
    );
    return Object.freeze(proof);
  }

  return Object.freeze({
    appendInTransaction,

    async verifyTenant({ tenantId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const transaction = await store.transaction((tx) => {
        const proofs = tenantProofs(tx, tenant);
        const failures = chainFailures(proofs);
        let verifiedRecordCount = 0;

        for (const proof of proofs) {
          const source = tx.get(proof.sourceCollection, proof.recordId);
          if (!source) {
            failures.push({
              proofId: proof.proofId,
              code: "source_record_missing",
            });
          } else if (source.tenantId !== tenant) {
            failures.push({
              proofId: proof.proofId,
              code: "source_tenant_mismatch",
            });
          } else if (sha256Canonical(source) !== proof.payloadHash) {
            failures.push({
              proofId: proof.proofId,
              code: "payload_hash_mismatch",
            });
          } else {
            verifiedRecordCount += 1;
          }
        }

        const sourceRecords = tx.list(USE_CASE_REGISTRY_EVENT_COLLECTION)
          .map(({ value }) => value)
          .filter((event) => event?.tenantId === tenant);
        const proofKeys = new Set(
          proofs.map((proof) =>
            `${proof.sourceCollection}\u0000${proof.recordId}`
          ),
        );
        for (const event of sourceRecords) {
          const key = `${USE_CASE_REGISTRY_EVENT_COLLECTION}\u0000${event.eventId}`;
          if (!proofKeys.has(key)) {
            failures.push({
              proofId: "",
              code: "source_record_unprotected",
              sourceCollection: USE_CASE_REGISTRY_EVENT_COLLECTION,
              recordId: event.eventId,
            });
          }
        }

        return Object.freeze({
          contractType: "UseCaseRegistryIntegrityVerification",
          contractVersion: "1.0",
          tenantId: tenant,
          valid: failures.length === 0
            && proofs.length === sourceRecords.length
            && verifiedRecordCount === sourceRecords.length,
          proofCount: proofs.length,
          protectedRecordCount: sourceRecords.length,
          verifiedRecordCount,
          failures: Object.freeze(
            failures.map((failure) => Object.freeze({ ...failure })),
          ),
          generatedAt: required(now(), "generatedAt"),
          sensitiveContentIncluded: false,
        });
      });

      return transaction.result;
    },
  });
}
