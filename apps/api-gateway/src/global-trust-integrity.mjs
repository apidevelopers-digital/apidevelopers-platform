import { randomUUID } from "node:crypto";
import { sha256Canonical } from "./canonical-hash.mjs";

export const GLOBAL_TRUST_INTEGRITY_COLLECTION = "global_trust_integrity_proofs";
export const GLOBAL_TRUST_PROTECTED_COLLECTIONS = Object.freeze([
  "global_trust_audit_events",
  "global_trust_authorization_decisions",
  "global_trust_risk_assessments",
  "global_trust_safety_decisions",
  "global_trust_decision_evidence",
  "global_trust_human_approval_requests",
  "global_trust_human_approval_resolutions",
  "global_trust_human_approval_consumptions",
  "global_trust_kill_switch_events",
]);
const SOURCE_SET = new Set(GLOBAL_TRUST_PROTECTED_COLLECTIONS);
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
  return tx.list(GLOBAL_TRUST_INTEGRITY_COLLECTION)
    .map(({ value }) => value)
    .filter((proof) => proof?.tenantId === tenantId)
    .sort((a, b) => a.sequence - b.sequence || a.proofId.localeCompare(b.proofId));
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

export function createGlobalTrustIntegrityService({
  store,
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") throw new TypeError("store.transaction is required");
  if (typeof idFactory !== "function") throw new TypeError("idFactory is required");
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
    if (!SOURCE_SET.has(collection)) throw new TypeError("sourceCollection is not protected");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload must be an object");
    }
    if (required(payload.tenantId, "payload.tenantId") !== tenant) {
      throw new TypeError("payload tenant mismatch");
    }

    const proofs = tenantProofs(tx, tenant);
    if (chainFailures(proofs).length) throw new TypeError("integrity chain is invalid");
    if (proofs.some((proof) =>
      proof.sourceCollection === collection && proof.recordId === id
    )) {
      throw new TypeError("integrity proof already exists");
    }

    const proof = {
      contractType: "GlobalTrustIntegrityProof",
      contractVersion: "1.0",
      proofId: required(idFactory(), "proofId"),
      tenantId: tenant,
      sequence: proofs.length + 1,
      sourceCollection: collection,
      recordId: id,
      payloadHash: sha256Canonical(payload),
      previousProofHash: proofs.at(-1)?.proofHash ?? GENESIS,
      algorithm: "sha256",
      recordedAt: required(now(), "recoredAt"),
    };
    proof.proofHash = proofHash(proof);

    return tx.put(
      GLOBAL_TRUST_INTEGRITY_COLLECTION,
      proof.proofId,
      Object.freeze(proof),
      { ifAbsent: true },
    );
  }

  function verifyTenantInTransaction(tx, { tenantId } = {}) {
    const tenant = required(tenantId, "tenantId");
    const proofs = tenantProofs(tx, tenant);
    const failures = chainFailures(proofs);
    const proofKeys = new Set(
      proofs.map((proof) => `${proof.sourceCollection}\u0000${proof.recordId}`),
    );

    let verified = 0;
    for (const proof of proofs) {
      const source = tx.get(proof.sourceCollection, proof.recordId);
      if (!source) {
        failures.push({ proofId: proof.proofId, code: "source_record_missing" });
      } else if (source.tenantId !== tenant) {
        failures.push({ proofId: proof.proofId, code: "source_tenant_mismatch" });
      } else if (sha256Canonical(source) !== proof.payloadHash) {
        failures.push({ proofId: proof.proofId, code: "payload_hash_mismatch" });
      } else {
        verified += 1;
    }
  }

    let protectedRecords = 0;
    for (const collection of GLOBAL_TRUST_PROTECTED_COLLECTIONS) {
    for (const { id, value } of tx.list(collection)) {
      if (value?.tenantId !== tenant) continue;
      protectedRecords += 1;
      if (!proofKeys.has(`${collection}\u0000${id}`)) {
        failures.push({
          proofId: "",
          code: "source_record_unprotected",
          sourceCollection: collection,
          recordId: id,
        });
      }
    }
  }

    return Object.freeze({
      contractType: "GlobalTrustIntegrityVerification",
      contractVersion: "1.0",
      tenantId: tenant,
      valid: failures.length === 0
        && proofs.length === protectedRecords
        && verified === protectedRecords,
      proofCount: proofs.length,
      protectedRecordCount: protectedRecords,
      verifiedRecordCount: verified,
      failures: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))),
      generatedAt: required(now(), "generatedAt"),
      sensitiveContentIncluded: false,
    });
  }

  return Object.freeze({
    appendInTransaction,
    verifyTenantInTransaction,

    async verifyTenant({ tenantId } = {}) {
      const transaction = await store.transaction((tx) =>
        verifyTenantInTransaction(tx, { tenantId })
      );
      return transaction.result;
    },
  });
}
