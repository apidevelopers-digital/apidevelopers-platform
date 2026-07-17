
import {
  assertCanonicalId,
  parseCanonicalId,
} from "../../contracts/src/index.mjs";

const SEMVER = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;
const LEGACY_CAPABILITY_ID = /^ap\.([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/;

const KIND_FAMILIES = Object.freeze({
  component: "component",
  capability: "capability",
  contract: "contract",
  policy: "policy",
});

export const registryKinds = Object.freeze(Object.keys(KIND_FAMILIES));
export const registryStatuses = Object.freeze(["active", "draft", "deprecated", "retired"]);
export const registryContractVersion = "1.0.0";

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function assertSemver(value, name = "version") {
  assertString(value, name);
  if (!SEMVER.test(value)) {
    throw new TypeError(`${name} must be a semantic version`);
  }
}

function normalizeStringArray(value, name) {
  if (value == null) return [];
  if (!Array.isArray(value)) throw new TypeError(`${name} must be an array`);
  const seen = new Set();
  const output = [];
  for (const [index, item] of value.entries()) {
    assertString(item, `${name}[${index}]`);
    if (seen.has(item)) throw new Error(`${name} contains duplicate value: ${item}`);
    seen.add(item);
    output.push(item);
  }
  return output.sort();
}

function assertKind(kind) {
  if (!registryKinds.includes(kind)) {
    throw new TypeError(`kind must be one of: ${registryKinds.join(", ")}`);
  }
}

function assertStatus(status) {
  if (!registryStatuses.includes(status)) {
    throw new TypeError(`status must be one of: ${registryStatuses.join(", ")}`);
  }
}

export function validateRegistryRecord(record) {
  assertObject(record, "record");
  const {
    id,
    kind,
    version,
    owner,
    status = "active",
    displayName = null,
    description = null,
    dependsOn = [],
    metadata = {},
  } = record;

  assertKind(kind);
  assertCanonicalId(id, { expectedFamily: KIND_FAMILIES[kind] });
  assertSemver(version);
  assertString(owner, "record.owner");
  assertStatus(status);
  if (displayName != null) assertString(displayName, "record.displayName");
  if (description != null) assertString(description, "record.description");
  assertObject(metadata, "record.metadata");

  const normalizedDependencies = normalizeStringArray(dependsOn, "record.dependsOn");
  for (const dependency of normalizedDependencies) {
    const parsed = parseCanonicalId(dependency);
    if (!registryKinds.includes(parsed.family)) {
      throw new TypeError(`registry dependencies must reference component, capability, contract, or policy ids: ${dependency}`);
    }
    if (dependency === id) throw new Error(`record cannot depend on itself: ${id}`);
  }

  return deepFreeze({
    id,
    kind,
    version,
    owner,
    status,
    displayName,
    description,
    dependsOn: normalizedDependencies,
    metadata: clone(metadata),
  });
}

function detectCycles(recordsById) {
  const visiting = new Set();
  const visited = new Set();

  function visit(id, path) {
    if (visiting.has(id)) {
      const cycleStart = path.indexOf(id);
      const cycle = [...path.slice(cycleStart), id].join(" -> ");
      throw new Error(`registry dependency cycle: ${cycle}`);
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const record = recordsById.get(id);
    for (const dependency of record.dependsOn) visit(dependency, [...path, id]);
    visiting.delete(id);
    visited.add(id);
  }

  for (const id of [...recordsById.keys()].sort()) visit(id, []);
}

export class Registry {
  #recordsById;
  #dependentsById;
  #snapshot;

  constructor(records = [], {
    registryId = "component.platform.registry",
    version = registryContractVersion,
    clock = () => new Date().toISOString(),
  } = {}) {
    if (!Array.isArray(records)) throw new TypeError("records must be an array");
    assertCanonicalId(registryId, { expectedFamily: "component" });
    assertSemver(version, "registry version");
    if (typeof clock !== "function") throw new TypeError("clock must be a function");

    const recordsById = new Map();
    for (const record of records) {
      const normalized = validateRegistryRecord(record);
      if (recordsById.has(normalized.id)) throw new Error(`duplicate registry id: ${normalized.id}`);
      recordsById.set(normalized.id, normalized);
    }

    for (const record of recordsById.values()) {
      for (const dependency of record.dependsOn) {
        if (!recordsById.has(dependency)) {
          throw new Error(`${record.id}: missing registry dependency ${dependency}`);
        }
      }
    }

    detectCycles(recordsById);

    const dependentsById = new Map([...recordsById.keys()].map((id) => [id, []]));
    for (const record of recordsById.values()) {
      for (const dependency of record.dependsOn) dependentsById.get(dependency).push(record.id);
    }
    for (const dependents of dependentsById.values()) dependents.sort();

    const generatedAt = clock();
    assertString(generatedAt, "clock result");
    const orderedRecords = [...recordsById.values()].sort((left, right) => left.id.localeCompare(right.id));

    this.#recordsById = recordsById;
    this.#dependentsById = dependentsById;
    this.#snapshot = deepFreeze({
      registryId,
      version,
      generatedAt,
      contractVersion: registryContractVersion,
      count: orderedRecords.length,
      records: orderedRecords,
      constraints: {
        readOnly: true,
        mutationAllowed: false,
        executionAllowed: false,
        automaticApprovalAllowed: false,
        canonicalIdsRequired: true,
      },
    });
  }

  has(id) {
    assertCanonicalId(id);
    return this.#recordsById.has(id);
  }

  get(id) {
    assertCanonicalId(id);
    return this.#recordsById.get(id) ?? null;
  }

  list({ kind, status } = {}) {
    if (kind != null) assertKind(kind);
    if (status != null) assertStatus(status);
    return deepFreeze(this.#snapshot.records.filter((record) => (
      (kind == null || record.kind === kind) &&
      (status == null || record.status === status)
    )));
  }

  dependenciesOf(id) {
    const record = this.get(id);
    if (!record) return deepFreeze([]);
    return deepFreeze(record.dependsOn.map((dependency) => this.#recordsById.get(dependency)));
  }

  dependentsOf(id) {
    assertCanonicalId(id);
    if (!this.#recordsById.has(id)) return deepFreeze([]);
    return deepFreeze(this.#dependentsById.get(id).map((dependent) => this.#recordsById.get(dependent)));
  }

  snapshot() {
    return this.#snapshot;
  }
}

export function createRegistry(records = [], options = {}) {
  return new Registry(records, options);
}

function normalizeLegacyCapabilityId(value, name) {
  assertString(value, name);
  const match = LEGACY_CAPABILITY_ID.exec(value);
  if (!match) throw new TypeError(`${name} must use the legacy ap.<name> format`);
  return `capability.${match[1]}`;
}

function normalizeLegacyStatus(value) {
  assertString(value, "manifest.status");
  if (!registryStatuses.includes(value)) {
    throw new TypeError(`manifest.status must be one of: ${registryStatuses.join(", ")}`);
  }
  return value;
}

export function adaptLegacyCapabilityManifest(manifest, { source = null } = {}) {
  assertObject(manifest, "manifest");
  const {
    schemaVersion,
    id,
    displayName,
    owner,
    maturity,
    status,
    dependsOn,
  } = manifest;

  if (!Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw new TypeError("manifest.schemaVersion must be a positive safe integer");
  }
  assertString(displayName, "manifest.displayName");
  assertString(owner, "manifest.owner");
  assertString(maturity, "manifest.maturity");
  if (!Array.isArray(dependsOn)) throw new TypeError("manifest.dependsOn must be an array");
  if (source != null) assertString(source, "source");

  const canonicalId = normalizeLegacyCapabilityId(id, "manifest.id");
  const canonicalDependencies = dependsOn.map((dependency, index) => (
    normalizeLegacyCapabilityId(dependency, `manifest.dependsOn[${index}]`)
  ));

  return validateRegistryRecord({
    id: canonicalId,
    kind: "capability",
    version: `${schemaVersion}.0.0`,
    owner,
    status: normalizeLegacyStatus(status),
    displayName,
    description: `Compatibility record for ${id}`,
    dependsOn: canonicalDependencies,
    metadata: {
      legacyId: id,
      legacySource: source,
      legacySchemaVersion: schemaVersion,
      maturity,
      category: manifest.category ?? null,
      productIndependent: manifest.productIndependent ?? null,
      multiTenant: manifest.multiTenant ?? null,
      auditRequired: manifest.auditRequired ?? null,
      publishes: clone(manifest.publishes ?? []),
      consumes: clone(manifest.consumes ?? []),
      factoryTemplate: manifest.factoryTemplate ?? null,
      paths: clone(manifest.paths ?? {}),
    },
  });
}

export function createRegistryFromLegacyCapabilityManifests(manifests, options = {}) {
  if (!Array.isArray(manifests)) throw new TypeError("manifests must be an array");
  const records = manifests.map((entry) => {
    assertObject(entry, "manifest entry");
    const { file, ...manifest } = entry;
    return adaptLegacyCapabilityManifest(manifest, {
      source: file ? `capabilities/${file}` : null,
    });
  });
  return createRegistry(records, options);
}

export function createLegacyCapabilityIndex(manifests, {
  clock = () => new Date().toISOString(),
  registryOptions = {},
} = {}) {
  if (!Array.isArray(manifests)) throw new TypeError("manifests must be an array");
  const before = clone(manifests);
  const registry = createRegistryFromLegacyCapabilityManifests(manifests, {
    ...registryOptions,
    clock,
  });
  const generatedAt = registry.snapshot().generatedAt;

  const capabilities = [...manifests]
    .sort((left, right) => String(left.file ?? "").localeCompare(String(right.file ?? "")))
    .map(({ file, ...manifest }) => ({
      ...clone(manifest),
      source: file ? `capabilities/${file}` : null,
    }));

  if (JSON.stringify(before) !== JSON.stringify(manifests)) {
    throw new Error("legacy capability manifests were mutated");
  }

  return deepFreeze({
    schemaVersion: 1,
    generatedAt,
    count: capabilities.length,
    capabilities,
  });
}
