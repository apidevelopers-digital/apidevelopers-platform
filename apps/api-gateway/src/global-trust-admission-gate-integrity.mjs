import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";

export const ADMISSION_DECISION_COLLECTION = "global_trust_admission_decisions";
export const ADMISSION_INTEGRITY_COLLECTION = "global_trust_admission_integrity_proofs";

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
    recordId: proof.recordId,
    payloadHash: proof.payloadHash,
    previousProofHash: proof.previousProofHash,
    algorithm: proof.algorithm,
    recordedAt: proof.recordedAt,
  });
}

function tenantProofs(tx, tenantId) {
  return tx.list(ADMISSION_INTEGRITY_COLLECTION)
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
      failures.push({ proofId: String(proof.proofId ?? ""), code: "sequence_mismatch" });
    }
    if (proof.previousProofHash !== previous) {
      failures.push({ proofId: String(proof.proofId ?? ""), code: "previous_hash_mismatch" });
    }
    if (proof.proofHash !== proofHash(proof)) {
      failures.push({ proofId: String(proof.proofId ?? ""), code: "proof_hash_mismatch" });
    }
    previous = String(proof.proofHash ?? "");
  }

  return failures;
}

export function createGlobalTrustAdmissionGateIntegrity({
  store,
  proofIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }

  function appendInTransaction(tx, { tenantId, recordId, payload } = {}) {
    const tenant = required(tenantId, "tenantId");
    const id = required(recordId, "recordId");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload must be an object");
    }
    if (required(payload.tenantId, "payload.tenantId") !== tenant) {
      throw new TypeError("payload tenant mismatch");
    }

    const proofs = tenantProofs(tx, tenant);
    if (chainFailures(proofs).length) {
      throw new TypeError("admission integrity chain is invalid");
    }
    if (proofs.some((proof) => proof.recordId === id)) {
      throw new TypeError("admission integrity proof already exists");
    }

    const proof = {
      contractType: "AdmissionDecisionIntegrityProof",
      contractVersion: "1.0",
      proofId: required(proofIdFactory(), "proofId"),
      tenantId: tenant,
      sequence: proofs.length + 1,
      recordId: id,
      payloadHash: sha256Canonical(payload),
      previousProofHash: proofs.at(-1)?.proofHash ?? GENESIS,
      algorithm: "sha256",
      recordedAt: required(now(), "recordedAt"),
      sensitiveContentIncluded: false,
    };
    proof.proofHash = proofHash(proof);

    tx.put(
      ADMISSION_INTEGRITY_COLLECTION,
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

        const proofRecordIds = new Set(proofs.map((proof) => proof.recordId));
        for (const proof of proofs) {
          const record = tx.get(ADMISSION_DECISION_COLLECTION, proof.recordId);
          if (!record) {
            failures.push({ proofId: proof.proofId, code: "source_record_missing" });
          } else if (record.tenantId !== tenant) {
            failures.push({ proofId: proof.proofId, code: "source_tenant_mismatch" });
          } else if (sha256Canonical(record) !== proof.payloadHash) {
            failures.push({ proofId: proof.proofId, code: "payload_hash_mismatch" });
          } else {
            verifiedRecordCount += 1;
          }
        }

        let protectedRecordCount = 0;
        for (const { id, value } of tx.list(ADMISSION_DECISION_COLLECTION)) {
          if (value?.tenantId !== tenant) continue;
          protectedRecordCount += 1;
          if (!proofRecordIds.has(id)) {
            failures.push({
              proofId: "",
              code: "source_record_unprotected",
              recordId: id,
            });
          }
        }

        return Object.freeze({
          contractType: "AdmissionIntegrityVerification",
          contractVersion: "1.0",
          tenantId: tenant,
          valid:
            failures.length === 0
            && proofs.length === protectedRecordCount
            && verifiedRecordCount === protectedRecordCount,
          proofCount: proofs.length,
          protectedRecordCount,
          verifiedRecordCount,
          failures: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))),
          generatedAt: required(now(), "generatedAt"),
          sensitiveContentIncluded: false,
        });
      });
      return transaction.result;
    },
  });
}
