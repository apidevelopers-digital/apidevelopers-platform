import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
} from "../src/global-trust-integrity-backfill-confirmation.mjs";
import { createGlobalTrustIntegrityBackfillService } from "../src/global-trust-integrity-backfill.mjs";
import {
  GLOBAL_TRUST_INTEGRITY_COLLECTION,
  createGlobalTrustIntegrityService,
} from "../src/global-trust-integrity.mjs";

const AUDIT = "global_trust_audit_events";
const AUTHORIZATION = "global_trust_authorization_decisions";
const EVIDENCE = "global_trust_decision_evidence";

test("plans and applies a deterministic tenant-scoped integrity backfill", async () => {
  const directory = await mkdtemp(join(tmpdir(), "integrity-backfill-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const proofIds = ["proof_001", "proof_002"];
    const integrity = createGlobalTrustIntegrityService({
      store,
      idFactory: () => proofIds.shift(),
      now: () => "2026-07-28T12:00:00.000Z",
    });
    const backfill = createGlobalTrustIntegrityBackfillService({
      store,
      integrity,
      now: () => "2026-07-28T12:00:01.000Z",
    });

    await store.transaction((tx) => {
      tx.put(AUDIT, "event_001", {
        tenantId: "tenant_001",
        occurredAt: "2026-07-28T10:00:00.000Z",
        outcome: "success",
      });
      tx.put(EVIDENCE, "evidence_001", {
        tenantId: "tenant_001",
        recordedAt: "2026-07-28T11:00:00.000Z",
        outcome: "allowed",
      });
      tx.put(AUTHORIZATION, "decision_other", {
        tenantId: "tenant_other",
        decidedAt: "2026-07-28T09:00:00.000Z",
        effect: "allow",
      });
    });

    const plan = await backfill.planTenant({ tenantId: "tenant_001" });
    assert.equal(plan.contractType, "GlobalTrustIntegrityBackfillPlan");
    assert.equal(plan.ready, true);
    assert.equal(plan.currentProofCount, 0);
    assert.equal(plan.protectedRecordCount, 2);
    assert.equal(plan.missingProofCount, 2);
    assert.equal(plan.missingByCollection[AUDIT], 1);
    assert.equal(plan.missingByCollection[EVIDENCE], 1);
    assert.deepEqual(plan.blockerCodes, []);
    assert.equal(plan.sensitiveContentIncluded, false);

    await assert.rejects(
      backfill.applyTenant({
        tenantId: "tenant_001",
        confirmation: "NOT_APPROVED",
      }),
      /explicit backfill confirmation is required/,
    );

    const execution = await backfill.applyTenant({
      tenantId: "tenant_001",
      confirmation: GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
    });
    assert.equal(execution.contractType, "GlobalTrustIntegrityBackfillExecution");
    assert.equal(execution.appliedProofCount, 2);
    assert.equal(execution.proofCount, 2);
    assert.equal(execution.protectedRecordCount, 2);
    assert.equal(execution.verifiedRecordCount, 2);
    assert.equal(execution.valid, true);
    assert.equal(execution.sensitiveContentIncluded, false);

    const verification = await integrity.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 2);

    const repeated = await backfill.applyTenant({
      tenantId: "tenant_001",
      confirmation: GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
    });
    assert.equal(repeated.appliedProofCount, 0);
    assert.equal(repeated.proofCount, 2);
    assert.equal(repeated.valid, true);

    const otherTenant = await backfill.planTenant({ tenantId: "tenant_other" });
    assert.equal(otherTenant.missingProofCount, 1);
    assert.equal(otherTenant.protectedRecordCount, 1);
    assert.equal(otherTenant.currentProofCount, 0);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("blocks backfill when an existing protected record or proof is already invalid", async () => {
  const directory = await mkdtemp(join(tmpdir(), "integrity-backfill-blocked-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const integrity = createGlobalTrustIntegrityService({
      store,
      idFactory: () => "proof_existing",
      now: () => "2026-07-28T12:00:00.000Z",
    });
    const backfill = createGlobalTrustIntegrityBackfillService({
      store,
      integrity,
      now: () => "2026-07-28T12:00:01.000Z",
    });

    const protectedEvent = {
      tenantId: "tenant_002",
      occurredAt: "2026-07-28T10:00:00.000Z",
      outcome: "success",
    };
    await store.transaction((tx) => {
      tx.put(AUDIT, "event_existing", protectedEvent);
      integrity.appendInTransaction(tx, {
        tenantId: "tenant_002",
        sourceCollection: AUDIT,
        recordId: "event_existing",
        payload: protectedEvent,
      });
    });

    await store.transaction((tx) => {
      tx.put(AUDIT, "event_existing", {
        ...protectedEvent,
        outcome: "failure",
      });
      tx.put(EVIDENCE, "evidence_missing", {
        tenantId: "tenant_002",
        recordedAt: "2026-07-28T11:00:00.000Z",
        outcome: "allowed",
      });
    });

    const plan = await backfill.planTenant({ tenantId: "tenant_002" });
    assert.equal(plan.ready, false);
    assert.equal(plan.missingProofCount, 1);
    assert.deepEqual(plan.blockerCodes, ["payload_hash_mismatch"]);

    await assert.rejects(
      backfill.applyTenant({
        tenantId: "tenant_002",
        confirmation: GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
      }),
      /integrity backfill is blocked: payload_hash_mismatch/,
    );

    const proofState = await store.transaction((tx) =>
      tx.list(GLOBAL_TRUST_INTEGRITY_COLLECTION)
    );
    assert.equal(proofState.result.length, 1);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
