import { randomUUID } from "node:crypto";

import { sha256Canonical } from "./canonical-hash.mjs";

export const TOOL_INVOCATION_DECISION_COLLECTION =
  "global_trust_tool_invocation_decisions";
export const TOOL_INVOCATION_PROOF_COLLECTION =
  "global_trust_tool_invocation_integrity_proofs";

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
  return tx.list(TOOL_INVOCATION_PROOF_COLLECTION)
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

export function createGlobalTrustToolInvocationIntegrity({
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

    if (collection !== TOOL_INVOCATION_DECISION_COLLECTION) {
      throw new TypeError("sourceCollection is not protected by tool invocation integrity");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload must be an object");
    }
    if (required(payload.tenantId, "payload.tenantId") !== tenant) {
      throw new TypeError("payload tenant mismatch");
    }

    const proofs = tenantProofs(tx, tenant);
    if (chainFailures(proofs).length) {
      throw new TypeError("tool invocation integrity chain is invalid");
    }
    if (proofs.some((proof) =>
      proof.sourceCollection === collection && proof.recordId === id
    )) {
      throw new TypeError("tool invocation integrity proof already exists");
    }

    const proof = {
      contractType: "ToolInvocationIntegrityProof",
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
      TOOL_INVOCATION_PROOF_COLLECTION,
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
        let verifiedRecords = 0;

        for (const proof of proofs) {
          const source = tx.get(proof.sourceCollection, proof.recordId);
          if (!source) {
            failures.push({ proofId: proof.proofId, code: "source_record_missing" });
          } else if (source.tenantId !== tenant) {
            failures.push({ proofId: proof.proofId, code: "source_tenant_mismatch" });
          } else if (sha256Canonical(source) !== proof.payloadHash) {
            failures.push({ proofId: proof.proofId, code: "payload_hash_mismatch" });
          } else {
            verifiedRecords += 1;
          }
        }

        return Object.freeze({
          contractType: "ToolInvocationIntegrityVerification",
          contractVersion: "1.0",
          tenantId: tenant,
          valid: failures.length === 0 && verifiedRecords === proofs.length,
          proofCount: proofs.length,
          verifiedRecordCount: verifiedRecords,
          failures: Object.freeze(failures.map((failure) => Object.freeze({ ...failure }))),
          generatedAt: required(now(), "generatedAt"),
          sensitiveContentIncluded: false,
        });
      });

      return transaction.result;
    },
  });
}
