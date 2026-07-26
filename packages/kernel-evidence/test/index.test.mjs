import test from "node:test";
import assert from "node:assert/strict";
import {
  createEvidenceRegistry,
  verifyEvidence,
  isEvidenceUsable,
  evidenceStatuses,
  evidenceTypes,
} from "../src/index.mjs";

const clock = () => "2026-07-26T05:00:00.000Z";
const base = {
  evidenceId: "evidence.1",
  tenantId: "tenant_alpha",
  cycleId: "cycle_1",
  type: "audit",
  source: { component: "test", artifactId: "artifact.1" },
  payload: { ok: true },
};

test("creates deeply immutable verifiable evidence", () => {
  const record = createEvidenceRegistry({ clock }).record(base);
  assert.equal(verifyEvidence(record), true);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.payload), true);
});

test("detects tampering", () => {
  const record = createEvidenceRegistry({ clock }).record(base);
  const tampered = structuredClone(record);
  tampered.payload.ok = false;
  assert.equal(verifyEvidence(tampered), false);
});

test("blocks secret-like fields and values recursively", () => {
  const registry = createEvidenceRegistry({ clock });
  assert.throws(
    () => registry.record({ ...base, payload: { nested: { api_key: "x" } } }),
    /secret-like field/,
  );
  assert.throws(
    () => registry.record({ ...base, payload: { value: "Bearer abcdefghijk" } }),
    /secret-like value/,
  );
});

test("enforces tenant and cycle scoped reads", () => {
  const registry = createEvidenceRegistry({ clock });
  registry.record(base);
  assert.equal(registry.get("evidence.1", { tenantId: "tenant_beta" }), null);
  assert.equal(registry.get("evidence.1", { cycleId: "cycle_2" }), null);
  assert.equal(registry.get("evidence.1", { tenantId: "tenant_alpha", cycleId: "cycle_1" }).evidenceId, "evidence.1");
});

test("builds and verifies a tenant-cycle digest chain", () => {
  const registry = createEvidenceRegistry({ clock });
  const first = registry.record(base);
  const second = registry.record({ ...base, evidenceId: "evidence.2", payload: { ok: 2 } });
  assert.equal(second.previousDigest, first.integrity.digest);
  assert.equal(registry.verifyChain({ tenantId: "tenant_alpha", cycleId: "cycle_1" }), true);
});

test("expires without deleting the immutable record", () => {
  const registry = createEvidenceRegistry({ clock });
  const record = registry.record({ ...base, expiresAt: "2026-07-26T06:00:00.000Z" });
  assert.equal(isEvidenceUsable(record, { at: "2026-07-26T05:30:00.000Z" }), true);
  assert.equal(registry.get("evidence.1", { at: "2026-07-26T06:00:00.000Z" }), null);
  assert.equal(registry.status("evidence.1", { at: "2026-07-26T06:00:00.000Z" }), "expired");
  assert.equal(registry.get("evidence.1", { at: "2026-07-26T06:00:00.000Z", includeInactive: true }).evidenceId, "evidence.1");
});

test("records revocation as append-only lifecycle evidence", () => {
  const registry = createEvidenceRegistry({ clock });
  registry.record(base);
  const event = registry.revoke("evidence.1", {
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    reason: "invalidated",
  });
  assert.equal(event.type, "revoked");
  assert.equal(registry.status("evidence.1"), "revoked");
  assert.equal(registry.get("evidence.1"), null);
  assert.equal(registry.history("evidence.1").length, 1);
});

test("supersession requires the same tenant and cycle", () => {
  const registry = createEvidenceRegistry({ clock });
  registry.record(base);
  registry.record({ ...base, evidenceId: "evidence.2" });
  const event = registry.supersede("evidence.1", {
    tenantId: "tenant_alpha",
    cycleId: "cycle_1",
    replacementEvidenceId: "evidence.2",
  });
  assert.equal(event.replacementEvidenceId, "evidence.2");
  assert.equal(registry.status("evidence.1"), "superseded");
});

test("returns defensive clones and deterministic lists", () => {
  const registry = createEvidenceRegistry({ clock });
  registry.record({ ...base, evidenceId: "evidence.b" });
  registry.record({ ...base, evidenceId: "evidence.a" });
  const item = registry.get("evidence.a");
  assert.throws(() => { item.payload.ok = false; }, /read only|Cannot assign/);
  assert.equal(registry.get("evidence.a").payload.ok, true);
  assert.deepEqual(
    registry.list().map((record) => record.evidenceId),
    ["evidence.a", "evidence.b"],
  );
});

test("exports canonical vocabularies", () => {
  assert.ok(evidenceTypes.includes("runtime-report"));
  assert.ok(evidenceStatuses.includes("active"));
});
