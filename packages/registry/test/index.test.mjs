
import test from "node:test";
import assert from "node:assert/strict";

import {
  Registry,
  adaptLegacyCapabilityManifest,
  createLegacyCapabilityIndex,
  createRegistry,
  createRegistryFromLegacyCapabilityManifests,
  registryContractVersion,
  registryKinds,
  registryStatuses,
  validateRegistryRecord,
} from "../src/index.mjs";

const NOW = "2026-07-17T07:00:00.000Z";
const clock = () => NOW;

function records() {
  return [
    {
      id: "component.github.publisher",
      kind: "component",
      version: "1.2.0",
      owner: "Platform Engineering",
      status: "active",
      displayName: "GitHub Publisher",
      dependsOn: [],
      metadata: { package: "@apidevelopers/publisher" },
    },
    {
      id: "contract.publish.v1",
      kind: "contract",
      version: "1.0.0",
      owner: "Platform Engineering",
      status: "active",
      dependsOn: [],
    },
    {
      id: "policy.security.release",
      kind: "policy",
      version: "1.0.0",
      owner: "Security Engineering",
      status: "active",
      dependsOn: ["contract.publish.v1"],
    },
    {
      id: "capability.publish",
      kind: "capability",
      version: "1.0.0",
      owner: "Platform Engineering",
      status: "active",
      dependsOn: [
        "component.github.publisher",
        "contract.publish.v1",
        "policy.security.release",
      ],
    },
  ];
}

function legacyManifests() {
  return [
    {
      file: "ap.events.json",
      schemaVersion: 1,
      id: "ap.events",
      displayName: "AP Events",
      category: "foundation",
      owner: "Platform Engineering",
      maturity: "L1",
      status: "active",
      productIndependent: true,
      multiTenant: true,
      auditRequired: true,
      dependsOn: [],
      publishes: ["event.recorded.v1"],
      consumes: [],
      factoryTemplate: "service",
      paths: { readme: "services/events/README.md" },
    },
    {
      file: "ap.auth.json",
      schemaVersion: 1,
      id: "ap.auth",
      displayName: "AP Auth",
      category: "foundation",
      owner: "Security Engineering",
      maturity: "L1",
      status: "active",
      productIndependent: true,
      multiTenant: true,
      auditRequired: true,
      dependsOn: ["ap.events"],
      publishes: ["auth.session.created.v1"],
      consumes: ["event.recorded.v1"],
      factoryTemplate: "service",
      paths: { readme: "services/auth/README.md" },
    },
  ];
}

test("exports frozen registry contract constants", () => {
  assert.equal(registryContractVersion, "1.0.0");
  assert.deepEqual(registryKinds, ["component", "capability", "contract", "policy"]);
  assert.deepEqual(registryStatuses, ["active", "draft", "deprecated", "retired"]);
  assert.equal(Object.isFrozen(registryKinds), true);
  assert.equal(Object.isFrozen(registryStatuses), true);
});

test("validates and freezes canonical registry records", () => {
  const record = validateRegistryRecord(records()[0]);
  assert.equal(record.id, "component.github.publisher");
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.dependsOn), true);
  assert.equal(Object.isFrozen(record.metadata), true);
});

test("rejects kind and canonical family mismatches", () => {
  assert.throws(
    () => validateRegistryRecord({ ...records()[0], kind: "capability" }),
    (error) => error.code === "ID_FAMILY_MISMATCH",
  );
  assert.throws(
    () => validateRegistryRecord({ ...records()[0], kind: "service" }),
    /kind must be one of/,
  );
});

test("rejects invalid semantic versions and statuses", () => {
  assert.throws(
    () => validateRegistryRecord({ ...records()[0], version: "v1" }),
    /semantic version/,
  );
  assert.throws(
    () => validateRegistryRecord({ ...records()[0], status: "enabled" }),
    /status must be one of/,
  );
});

test("rejects duplicate dependency values and self dependencies", () => {
  assert.throws(
    () => validateRegistryRecord({
      ...records()[3],
      dependsOn: ["contract.publish.v1", "contract.publish.v1"],
    }),
    /duplicate value/,
  );
  assert.throws(
    () => validateRegistryRecord({
      ...records()[3],
      dependsOn: ["capability.publish"],
    }),
    /cannot depend on itself/,
  );
});

test("creates a deterministic read-only registry snapshot", () => {
  const registry = createRegistry(records(), { clock });
  const snapshot = registry.snapshot();
  assert.equal(registry instanceof Registry, true);
  assert.equal(snapshot.registryId, "component.platform.registry");
  assert.equal(snapshot.generatedAt, NOW);
  assert.equal(snapshot.count, 4);
  assert.deepEqual(snapshot.records.map((record) => record.id), [
    "capability.publish",
    "component.github.publisher",
    "contract.publish.v1",
    "policy.security.release",
  ]);
  assert.deepEqual(snapshot.constraints, {
    readOnly: true,
    mutationAllowed: false,
    executionAllowed: false,
    automaticApprovalAllowed: false,
    canonicalIdsRequired: true,
  });
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.records), true);
});

test("rejects duplicate registry ids", () => {
  const duplicate = [records()[0], structuredClone(records()[0])];
  assert.throws(() => createRegistry(duplicate, { clock }), /duplicate registry id/);
});

test("rejects missing registry dependencies", () => {
  assert.throws(
    () => createRegistry([records()[3]], { clock }),
    /missing registry dependency component\.github\.publisher/,
  );
});

test("rejects dependency cycles", () => {
  const cyclic = [
    {
      id: "capability.alpha",
      kind: "capability",
      version: "1.0.0",
      owner: "Platform",
      dependsOn: ["capability.beta"],
    },
    {
      id: "capability.beta",
      kind: "capability",
      version: "1.0.0",
      owner: "Platform",
      dependsOn: ["capability.alpha"],
    },
  ];
  assert.throws(() => createRegistry(cyclic, { clock }), /dependency cycle/);
});

test("supports canonical lookup and filtered listing", () => {
  const registry = createRegistry(records(), { clock });
  assert.equal(registry.has("capability.publish"), true);
  assert.equal(registry.has("capability.missing"), false);
  assert.equal(registry.get("contract.publish.v1").kind, "contract");
  assert.equal(registry.get("contract.missing.v1"), null);
  assert.deepEqual(
    registry.list({ kind: "policy", status: "active" }).map((record) => record.id),
    ["policy.security.release"],
  );
});

test("does not accept legacy ids as silent lookup aliases", () => {
  const registry = createRegistry(records(), { clock });
  assert.throws(
    () => registry.get("ap.auth"),
    (error) => error.code === "ID_UNKNOWN_FAMILY",
  );
});

test("returns deterministic dependencies and dependents", () => {
  const registry = createRegistry(records(), { clock });
  assert.deepEqual(
    registry.dependenciesOf("capability.publish").map((record) => record.id),
    ["component.github.publisher", "contract.publish.v1", "policy.security.release"],
  );
  assert.deepEqual(
    registry.dependentsOf("contract.publish.v1").map((record) => record.id),
    ["capability.publish", "policy.security.release"],
  );
  assert.equal(Object.isFrozen(registry.dependenciesOf("capability.publish")), true);
});

test("does not mutate source records", () => {
  const input = records();
  const before = structuredClone(input);
  createRegistry(input, { clock });
  assert.deepEqual(input, before);
});

test("adapts a legacy ap capability explicitly to a canonical capability record", () => {
  const record = adaptLegacyCapabilityManifest(legacyManifests()[1], {
    source: "capabilities/ap.auth.json",
  });
  assert.equal(record.id, "capability.auth");
  assert.equal(record.kind, "capability");
  assert.equal(record.version, "1.0.0");
  assert.deepEqual(record.dependsOn, ["capability.events"]);
  assert.equal(record.metadata.legacyId, "ap.auth");
  assert.equal(record.metadata.legacySource, "capabilities/ap.auth.json");
  assert.deepEqual(record.metadata.publishes, ["auth.session.created.v1"]);
});

test("rejects malformed legacy capability manifests", () => {
  const manifest = legacyManifests()[0];
  assert.throws(
    () => adaptLegacyCapabilityManifest({ ...manifest, id: "capability.events" }),
    /legacy ap\.<name> format/,
  );
  assert.throws(
    () => adaptLegacyCapabilityManifest({ ...manifest, schemaVersion: 0 }),
    /positive safe integer/,
  );
  assert.throws(
    () => adaptLegacyCapabilityManifest({ ...manifest, dependsOn: ["capability.auth"] }),
    /legacy ap\.<name> format/,
  );
});

test("builds a canonical registry from legacy capability manifests", () => {
  const registry = createRegistryFromLegacyCapabilityManifests(legacyManifests(), { clock });
  assert.deepEqual(
    registry.list({ kind: "capability" }).map((record) => record.id),
    ["capability.auth", "capability.events"],
  );
  assert.deepEqual(
    registry.dependenciesOf("capability.auth").map((record) => record.id),
    ["capability.events"],
  );
});

test("preserves the legacy generated index shape through an explicit compatibility export", () => {
  const manifests = legacyManifests();
  const index = createLegacyCapabilityIndex(manifests, { clock });
  assert.equal(index.schemaVersion, 1);
  assert.equal(index.generatedAt, NOW);
  assert.equal(index.count, 2);
  assert.deepEqual(index.capabilities.map((item) => item.id), ["ap.auth", "ap.events"]);
  assert.deepEqual(index.capabilities.map((item) => item.source), [
    "capabilities/ap.auth.json",
    "capabilities/ap.events.json",
  ]);
  assert.equal(Object.isFrozen(index), true);
});

test("does not mutate legacy manifests while adapting or generating compatibility output", () => {
  const manifests = legacyManifests();
  const before = structuredClone(manifests);
  createRegistryFromLegacyCapabilityManifests(manifests, { clock });
  createLegacyCapabilityIndex(manifests, { clock });
  assert.deepEqual(manifests, before);
});
