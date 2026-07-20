
import test from "node:test";
import assert from "node:assert/strict";

import {
  PORTAL_INSTITUTIONAL_TYPES,
  createPortalTypedExtractor,
  extractInstitutionalRecords,
} from "../src/typed-extractor.mjs";

const COMMIT = "ca2d28c81bbcd28dd4391c4c58f0014c69c7bf63";
const SOURCE_REF = { commit: COMMIT, path: "docs/architecture/PORTAL_DATA_MODEL.md", checksum: "a".repeat(64) };

function projection(values) {
  return {
    sourceRepository: "sitedauni/apidevelopers-platform",
    sourceCommit: COMMIT,
    records: [{
      id: "portal-document:docs/architecture/PORTAL_DATA_MODEL.md",
      path: "docs/architecture/PORTAL_DATA_MODEL.md",
      yamlBlocks: values.map((value) => ({ value })),
    }],
  };
}

const samples = {
  SourceRef: { repository: "sitedauni/apidevelopers-platform", commit: COMMIT, path: "docs/a.md", checksum: "a".repeat(64) },
  Node: { id: "NODE-1", type: "capability", name: "Portal", status: "validated", owner: "platform", source_ref: SOURCE_REF },
  Relation: { id: "REL-1", type: "IMPLEMENTS", from: "NODE-1", to: "NODE-2", source_ref: SOURCE_REF },
  Evidence: { id: "EVD-1", type: "ci_run", status: "passed", subject_id: "NODE-1", source_ref: SOURCE_REF },
  StateSnapshot: { id: "STATE-1", scope: "portal", status: "active", head: COMMIT, captured_at: "2026-07-20T00:00:00Z", source_ref: SOURCE_REF },
  Iteration: { id: "ITER-1", title: "Portal", status: "in_progress", scope: ["docs"], authorized_actions: ["update"], forbidden_actions: ["deploy"], source_ref: SOURCE_REF },
  Approval: { id: "APR-1", action_id: "ACT-1", status: "approved", approved_by: "igor", approved_at: "2026-07-20T00:00:00Z", scope: ["deploy"], source_ref: SOURCE_REF },
  AuditEvent: { id: "AUD-1", action_id: "ACT-1", actor_id: "igor", result: "success", executed_at: "2026-07-20T00:00:00Z", source_ref: SOURCE_REF },
};

test("extracts all eight institutional types in canonical order", () => {
  const result = extractInstitutionalRecords(projection(Object.values(samples)), { requireAllTypes: true });
  assert.deepEqual(result.records.map((record) => record.institutionalType), PORTAL_INSTITUTIONAL_TYPES);
  assert.equal(result.recordCount, 8);
  assert.match(result.contentChecksum, /^[0-9a-f]{64}$/);
});

test("is deterministic across repeated extraction of the same source order", () => {
  const values = Object.values(samples);
  const one = extractInstitutionalRecords(projection(values));
  const two = extractInstitutionalRecords(projection(values));
  assert.deepEqual(one, two);
});

test("preserves SourceRef and extraction evidence", () => {
  const result = extractInstitutionalRecords(projection([samples.Node]));
  const [record] = result.records;
  assert.deepEqual(record.sourceRef, SOURCE_REF);
  assert.equal(record.extractedFrom.documentPath, "docs/architecture/PORTAL_DATA_MODEL.md");
  assert.equal(record.extractedFrom.yamlBlockIndex, 0);
});

test("rejects duplicate identifiers", () => {
  assert.throws(
    () => extractInstitutionalRecords(projection([samples.Node, samples.Node])),
    (error) => error.code === "PORTAL_TYPED_EXTRACTOR_DUPLICATE_ID",
  );
});

test("rejects mixed commit source references", () => {
  const invalid = structuredClone(samples.Node);
  invalid.source_ref.commit = "b".repeat(40);
  assert.throws(
    () => extractInstitutionalRecords(projection([invalid])),
    (error) => error.code === "PORTAL_TYPED_EXTRACTOR_MIXED_COMMIT",
  );
});

test("can require all eight institutional types", () => {
  assert.throws(
    () => extractInstitutionalRecords(projection([samples.Node]), { requireAllTypes: true }),
    (error) => error.code === "PORTAL_TYPED_EXTRACTOR_TYPES_MISSING" && error.details.missing.includes("Approval"),
  );
});

test("ignores unrelated yaml blocks without inventing types", () => {
  const result = extractInstitutionalRecords(projection([{ status: "draft", note: "narrative metadata" }]));
  assert.equal(result.recordCount, 0);
});

test("facade remains explicitly read-only", () => {
  const extractor = createPortalTypedExtractor();
  assert.equal(extractor.mutationAllowed, false);
  assert.equal(typeof extractor.extract, "function");
  assert.equal("write" in extractor, false);
});
