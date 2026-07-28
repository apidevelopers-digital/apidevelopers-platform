import { createHash, randomUUID } from "node:crypto";

export const GLOBAL_TRUST_INTEGRITY_COLLECTION = "global_trust_integrity_proofs";
export const GLOBAL_TRUST_PROTECTED_COLLECTIONS = Object.freeze([
  "global_trust_audit_events",
  "global_trust_authorization_decisions",
  "global_trust_risk_assessments",
  "global_trust_safety_decisions",
  "global_trust_decision_evidence",
]);

const GENESIS_HASH = "0".repeat(64);
const PROTECTED_COLLECTION_SET = new Set(GLOBAL_TRUST_PROTECTED_COLLECTIONS);

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function canonicalJson(value) {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("canonical payload numbers must be finite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.keys(value)
      .sort()
      .map((key) => {
        if (value[key] === undefined) throw new TypeError(`canonical payload field ${key} is undefined`);
        return `${JSON.stringify(key)}:${canonicalJson(value[key])}`;
      });
    return `{${entries.join(",")}}`;
  }
  throw new TypeError(`unsupported canonical payload type: ${typeof value}`);
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function payloadHash(payload) {
  return sha256(canonicalJson(payload));
}

function proofHashInput(proof) {
  return {
    proofId: proof.proofId,
    tenantId: proof.tenantId,
    sequence: proof.sequence,
    sourceCollection: proof.sourceCollection,
    recordId: proof.recordId,
    payloadHash: proof.payloadHash,
    previousProofHash: proof.previousProofHash,
    algorithm: proof.algorithm,
    recordedAt: proof.recordedAt,
  };
}

function computeProofHash(proof) {
  return sha256(canonicalJson(proofHashInput(proof)));
}

function tenantProofs(tx, tenantId) {
  return tx
    .list(GLOBAL_TRUST_INTEGRITY_COLLECTION)
    .map(({ value }) => value)
    .filter((proof) => proof?.tenantId === tenantId)
    .sort((left, right) => left.sequence - right.sequence || left.proofId.localeCompare(right.proofId));
}

function verifyProofStructure(proofs) {
  const failures = [];
  let previousProofHash = GENESIS_HASH;

  for (let index = 0; index < proofs.length; index += 1) {
    const proof = proofs[index];
    const expectedSequence = index + 1;

    if (proof.sequence !== expectedSequence) {
      failures.push({
        proofId: String(proof.proofId ?? ""),
        code: "sequence_mismatch",
        expected: expectedSequence,
        actual: proof.sequence,
      });
    }
    if (proof.previousProofHash !== previousProofHash) {
      failures.push({
        proofId: String(proof.proofId ?? ""),
        code: "previous_hash_mismatch",
      });
    }
    if (proof.proofHash !== computeProofHash(proof)) {
      failures.push({
        proofId: String(proof.proofId ?? ""),
        code: "proof_hash_mismatch",
      });
    }
    previousProofHash = String(proof.proofHash ?? "");
  }

  return failures;
}

function requireProtectedCollection(value) {
  const normalized = requireText(value, "sourceCollection");
  if (!PROTECTED_COLLECTION_SET.has(normalized)) {
    throw new TypeError(`sourceCollection is not protected: ${normalized}`);
  }
  return normalized;
}

export function createGlobalTrustIntegrityService({
  store,
  idFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction must be a function");
  }
  if (typeof idFactory !== "function") throw new TypeError("idFactory must be a function");
  if (typeof now !== "function") throw new TypeError("now must be a function");

  const appendInTransaction = (tx, {
    tenantId,
    sourceCollection,
    recordId,
    payload,
  } = {}) => {
    if (typeof tx?.list !== "function" || typeof tx?.get !== "function" || typeof tx?.put !== "function") {
      throw new TypeError("tx must provide list, get and put");
    }

    const normalizedTenantId = requireText(tenantId, "tenantId");
    const normalizedCollection = requireProtectedCollection(sourceCollection);
    const normalizedRecordId = requireText(recordId, "recordId");

    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new TypeError("payload must be an object");
    }
    if (requireText(payload.tenantId, "payload.tenantId") !== normalizedTenantId) {
      throw new TypeError("payload.tenantId must match tenantId");
    }

    const proofs = tenantProofs(tx, normalizedTenantId);
    const structuralFailures = verifyProofStructure(proofs);
    if (structuralFailures.length > 0) {
      throw new TypeError("existing Global Trust integrity chain is invalid");
    }
    if (proofs.some((proof) =>
      proof.sourceCollection === normalizedCollection && proof.recordId === normalizedRecordId
    )) {
      throw new TypeError("integrity proof already exists for source record");
    }

    const sequence = proofs.length + 1;
    const proof = {
      contractType: "GlobalTrustIntegrityProof",
      contractVersion: "1.0",
      proofId: requireText(idFactory(), "proofId"),
      tenantId: normalizedTenantId,
      sequence,
      sourceCollection: normalizedCollection,
      recordId: normalizedRecordId,
      payloadHash: payloadHash(payload),
      previousProofHash: proofs.at(-1)?.proofHash ?? GENESIS_HASH,
      algorithm: "sha256",
      recordedAt: requireText(now(), "recordedAt"),
    };
    proof.proofHash = computeProofHash(proof);

    return tx.put(
      GLOBAL_TRUST_INTEGRITY_COLLECTION,
      proof.proofId,
      Object.freeze(proof),
      { ifAbsent: true },
    );
  };

  return Object.freeze({
    appendInTransaction,

    async verifyTenant({ tenantId } = {}) {
      const normalizedTenantId = requireText(tenantId, "tenantId");
      const result = await store.transaction((tx) => {
        const proofs = tenantProofs(tx, normalizedTenantId);
        const failures = verifyProofStructure(proofs);
        const proofBySource = new Map(
          proofs.map((proof) => [`${proof.sourceCollection}\u0000${proof.recordId}`, proof]),
        );

        let verifiedRecords = 0;
        for (const proof of proofs) {
          const source = tx.get(proof.sourceCollection, proof.recordId);
          if (!source) {
            failures.push({ proofId: proof.proofId, code: "source_record_missing" });
            continue;
          }
          if (source.tenantId !== normalizedTenantId) {
            failures.push({ proofId: proof.proofId, code: "source_tenant_mismatch" });
            continue;
          }
          if (payloadHash(source) !== proof.payloadHash) {
            failures.push({ proofId: proof.proofId, code: "payload_hash_mismatch" });
            continue;
          }
          verifiedRecords += 1;
        }

        let protectedRecords = 0;
        for (const sourceCollection of GLOBAL_TRUST_PROTECTED_COLLECTIONS) {
          for (const { id, value } of tx.list(sourceCollection)) {
            if (value?.tenantId !== normalizedTenantId) continue;
            protectedRecords += 1;
            if (!proofBySource.has(`${sourceCollection}\u0000${id}`)) {
              failures.push({
                proofId: "",
                code: "source_record_unprotected",
                sourceCollection',
                recordId: [id],
              });
            }
          }
        }

        return {
          proofs: proofs.length,
          protectedRecords,
          verifiedRecords,
          failures,
        };
      });

      return Object.freeze({
        contractType: "GlobalTrustIntegrityVerification",
        contractVersion: "1.0",
        tenantId: normalizedTenantId,
        valid: result.result.failures.length === 0
          && result.result.proofs === result.result.protectedRecords
          && result.result.verifiedRecords === result.result.protectedRecords,
        proofCount: result.result.proofs,
        protectedRecordCount: result.result.protectedRecords,
        verifiedRecordCount: result.result.verifiedRecords,
        failures: Object.freeze(result.result.failures.map((failure) => Object.freeze({ ...failure }))),
        generatedAt: requireText(now(), "generatedAt"),
        sensitiveContentIncluded: false,
      });
    },
  });
}
