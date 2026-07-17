import test from "node:test";
import assert from "node:assert/strict";

import { createLegacyCapabilityIndex } from "../src/legacy-index.mjs";

const clock = () => "2026-07-17T08:00:00.000Z";

function cyclic() {
  return [
    {
      file: "ap.audit.json",
      schemaVersion: 1,
      id: "ap.audit",
      displayName: "AP Audit",
      owner: "Security Engineering",
      maturity: "L1",
      status: "active",
      dependsOn: ["ap.tenancy"],
    },
    {
      file: "ap.tenancy.json",
      schemaVersion: 1,
      id: "ap.tenancy",
      displayName: "AP Tenancy",
      owner: "Platform Engineering",
      maturity: "L1",
      status: "active",
      dependsOn: ["ap.audit"],
    },
  ];
}

test("preserves cyclic legacy manifests without treating them as canonical registry records", () => {
  const manifests = cyclic();
  const before = structuredClone(manifests);
  const index = createLegacyCapabilityIndex(manifests, { clock });

  assert.equal(index.count, 2);
  assert.equal(index.generatedAt, clock());
  assert.deepEqual(index.capabilities.map((item) => item.id), ["ap.audit", "ap.tenancy"]);
  assert.deepEqual(manifests, before);
  assert.equal(Object.isFrozen(index), true);
});

test("rejects duplicate, missing and self legacy dependencies", () => {
  const duplicate = cyclic();
  duplicate.push(structuredClone(duplicate[0]));
  assert.throws(() => createLegacyCapabilityIndex(duplicate, { clock }), /duplicate capability id/);

  const missing = cyclic();
  missing[0].dependsOn = ["ap.missing"];
  assert.throws(() => createLegacyCapabilityIndex(missing, { clock }), /missing dependency/);

  const self = cyclic();
  self[0].dependsOn = ["ap.audit"];
  assert.throws(() => createLegacyCapabilityIndex(self, { clock }), /self dependency/);
});

test("rejects malformed legacy identifiers and does not normalize silently", () => {
  const manifests = cyclic();
  manifests[0].id = "capability.audit";
  assert.throws(() => createLegacyCapabilityIndex(manifests, { clock }), /legacy ap\.<name> format/);
});
