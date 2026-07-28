import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  createGlobalTrustIntegrityService,
  GLOBAL_TRUST_INTEGRITY_COLLECTION,
} from "../src/global-trust-integrity.mjs";

const AUDIT_COLLECTION = "global_trust_audit_events";

test("verifies an intact tenant chain and detects source payload tampering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-integrity-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const service = createGlobalTrustIntegrityService({
      store,
      idFactory: () => "proof_001",
      now: () => "2026-07-28T12:00:00.000Z",
    });
    const event = Object.freeze({
      contractType: "AuditEvent",
      contractVersion: "1.0",
      eventId: "event_001",
      tenantId: "tenant_001",
      actorId: "actor_001",
      action: "gateway.tenant_context.issued",
      resource: "GET /v1/whoami",
      outcome: "success",
      correlationId: "corr_001",
      occurredAt: "2026-07-28T12:00:00.000Z",
      metadata: Object.freeze({ region: "br-south" }),
      sensitiveContentIncluded: false,
    });

    await store.transaction((tx) => {
      tx.put(AUDIT_COLLECTION, event.eventId, event, { ifAbsent: true });
      service.appendInTransaction(tx, {
        tenantId: event.tenantId,
        sourceCollection: AUDIT_COLLECTION,
        recordId: event.eventId,
        payload: event,
      });
    });

    const valid = await service.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(valid.valid, true);
    assert.equal(valid.proofCount, 1);
    assert.equal(valid.protectedRecordCount, 1);
    assert.equal(valid.verifiedRecordCount, 1);
    assert.deepEqual(valid.failures, []);
    assert.equal(valid.sensitiveContentIncluded, false);

    const proofState = await store.transaction((tx) =>
      tx.list(GLOBAL_TRUST_INTEGRITY_COLLECTION),
    );
    assert.equal(proofState.result.length, 1);
    assert.equal(proofState.result[0].value.algorithm, "sha256");
    assert.equal(proofState.result[0].value.previousProofHash, "0".repeat(64));

    await store.transaction((tx) => {
      tx.put(AUDIT_COLLECTION, event.eventId, {
        ...event,
        outcome: "failure",
      });
    });

    const tampered = await service.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(tampered.valid, false);
    assert.equal(
      tampered.failures.some((failure) => failure.code === "payload_hash_mismatch"),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("detects mutation of an integrity proof in the tenant chain", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-integrity-proof-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const service = createGlobalTrustIntegrityService({
      store,
      idFactory: () => "proof_002",
      now: () => "2026-07-28T12:00:00.000Z",
    });
    const event = {
      eventId: "event_002",
      tenantId: "tenant_002",
      outcome: "success",
    };

    await store.transaction((tx) => {
      tx.put(AUDIT_COLLECTION, event.eventId, event, { ifAbsent: true });
      service.appendInTransaction(tx, {
        tenantId: event.tenantId,
        sourceCollection: AUDIT_COLLECTION,
        recordId: event.eventId,
        payload: event,
      });
    });

    await store.transaction((tx) => {
      const proof = tx.get(GLOBAL_TRUST_INTEGRITY_COLLECTION, "proof_002");
      tx.put(GLOBAL_TRUST_INTEGRITY_COLLECTION, "proof_002", {
        ...proof,
        proofHash: "f".repeat(64),
      });
    });

    const verification = await service.verifyTenant({ tenantId: "tenant_002" });
    assert.equal(verification.valid, false);
    assert.equal(
      verification.failures.some((failure) => failure.code === "proof_hash_mismatch"),
      true,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
