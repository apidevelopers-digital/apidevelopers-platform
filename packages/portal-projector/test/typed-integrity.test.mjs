
import test from "node:test";
import assert from "node:assert/strict";

import {
  createPortalTypedIntegrityValidator,
  reconcileTypedIntegrity,
} from "../src/typed-integrity.mjs";

const COMMIT = "aa8a4d46ecfcbdf84926a5e88c51d99b8d7c752a";
const REF = { commit: COMMIT, path: "docs/architecture/PORTAL_DATA_MODEL.md", checksum: "a".repeat(64) };

function record(institutionalType, institutionalId, value) {
  return { institutionalType, institutionalId, value, sourceRef: REF };
}

function validProjection() {
  return {
    sourceCommit: COMMIT,
    records: [
      record("Node", "NODE-1", { id: "NODE-1", type: "capability" }),
      record("Node", "NODE-2", { id: "NODE-2", type: "component" }),
      record("Relation", "REL-1", { id: "REL-1", from: "NODE-1", to: "NODE-2" }),
      record("Evidence", "EVD-1", { id: "EVD-1", subject_id: "NODE-1" }),
      record("StateSnapshot", "STATE-1", { id: "STATE-1", head: COMMIT }),
      record("Iteration", "ITER-1", {
        id: "ITER-1",
        authorized_actions: ["update_document"],
        forbidden_actions: ["deploy"],
      }),
      record("Approval", "APR-1", { id: "APR-1", action_id: "ACT-1" }),
      record("AuditEvent", "AUD-1", {
        id: "AUD-1",
        action_id: "ACT-1",
        approval_id: "APR-1",
        evidence_id: "EVD-1",
      }),
    ],
  };
}

test("accepts a coherent typed projection", () => {
  const result = reconcileTypedIntegrity(validProjection());
  assert.equal(result.status, "in_sync");
  assert.equal(result.findingCount, 0);
  assert.equal(result.checkedRecordCount, 8);
});

test("reports missing relation endpoints", () => {
  const projection = validProjection();
  projection.records.find((item) => item.institutionalType === "Relation").value.to = "NODE-X";
  const result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.equal(result.status, "invalid");
  assert.equal(result.findings[0].code, "PORTAL_TYPED_INTEGRITY_RELATION_TO_MISSING");
});

test("reports evidence with an unknown subject", () => {
  const projection = validProjection();
  projection.records.find((item) => item.institutionalType === "Evidence").value.subject_id = "UNKNOWN";
  const result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_EVIDENCE_SUBJECT_MISSING"));
});

test("reports snapshot heads from another commit", () => {
  const projection = validProjection();
  projection.records.find((item) => item.institutionalType === "StateSnapshot").value.head = "b".repeat(40);
  const result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_SNAPSHOT_HEAD_MISMATCH"));
});

test("reports iteration action conflicts", () => {
  const projection = validProjection();
  projection.records.find((item) => item.institutionalType === "Iteration").value.forbidden_actions.push("update_document");
  const result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_ITERATION_ACTION_CONFLICT"));
});

test("reports missing approvals, evidence and action mismatches", () => {
  const projection = validProjection();
  const audit = projection.records.find((item) => item.institutionalType === "AuditEvent").value;
  audit.approval_id = "APR-X";
  audit.evidence_id = "EVD-X";
  let result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_AUDIT_APPROVAL_MISSING"));
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_AUDIT_EVIDENCE_MISSING"));

  audit.approval_id = "APR-1";
  audit.evidence_id = "EVD-1";
  audit.action_id = "ACT-2";
  result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_AUDIT_APPROVAL_ACTION_MISMATCH"));
});

test("fails closed by default", () => {
  const projection = validProjection();
  projection.records.find((item) => item.institutionalType === "Relation").value.from = "NODE-X";
  assert.throws(
    () => reconcileTypedIntegrity(projection),
    (error) => error.code === "PORTAL_TYPED_INTEGRITY_INVALID" && error.details.findingCount === 1,
  );
});

test("rejects records from another commit", () => {
  const projection = validProjection();
  projection.records[0] = { ...projection.records[0], sourceRef: { ...REF, commit: "b".repeat(40) } };
  const result = reconcileTypedIntegrity(projection, { failOnError: false });
  assert.ok(result.findings.some((item) => item.code === "PORTAL_TYPED_INTEGRITY_MIXED_COMMIT"));
});

test("facade remains explicitly read-only", () => {
  const validator = createPortalTypedIntegrityValidator();
  assert.equal(validator.mutationAllowed, false);
  assert.equal(typeof validator.validate, "function");
  assert.equal("write" in validator, false);
});
