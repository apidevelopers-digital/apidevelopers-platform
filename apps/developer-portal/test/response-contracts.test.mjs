import assert from "node:assert/strict";
import {
  classifyResponseState,
  normalizeInstitutional,
  normalizeLearning,
} from "../public/contracts.js";

const institutional = normalizeInstitutional({
  data: {
    summary: { title: "Instituição", status: "ready" },
    records: [{ id: "record-1" }],
    modules: [{ id: "module-1" }],
    versions: [{ id: "v1" }],
    integrity: { status: "healthy", sources: [{ id: "canonical" }] },
  },
  meta: { projectionVersion: "1.0.0", stale: false },
});
assert.equal(institutional.records.length, 1);
assert.equal(institutional.modules.length, 1);
assert.equal(institutional.meta.projectionVersion, "1.0.0");

const learning = normalizeLearning({
  sections: {
    memories: [{ id: "memory-1" }],
    findings: [{ id: "finding-1" }],
    proposals: [{ id: "proposal-1", status: "pending" }],
    evidence: [{ id: "evidence-1" }],
  },
  summary: { status: "ready" },
  meta: { projectionVersion: "learning-v1" },
});
assert.equal(learning.memories.length, 1);
assert.equal(learning.findings.length, 1);
assert.equal(learning.proposals[0].status, "pending");
assert.equal(learning.evidence.length, 1);

const empty = normalizeLearning({ sections: {} });
assert.deepEqual(empty.memories, []);
assert.deepEqual(empty.proposals, []);

assert.deepEqual(classifyResponseState({ status: 403 }), {
  kind: "policy",
  retryable: false,
});
assert.deepEqual(classifyResponseState({ error: { retryable: true } }), {
  kind: "error",
  retryable: true,
});
assert.deepEqual(classifyResponseState({ meta: { stale: true } }), {
  kind: "stale",
  retryable: true,
});
assert.deepEqual(classifyResponseState({ hasData: false }), {
  kind: "empty",
  retryable: false,
});
assert.deepEqual(classifyResponseState({ hasData: true }), {
  kind: "ready",
  retryable: false,
});

console.log("developer-portal response contract fixtures: ok");
