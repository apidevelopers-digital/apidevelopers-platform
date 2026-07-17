const LEGACY_ID = /^ap\.([a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+(?:-[a-z0-9]+)*)*)$/;

function clone(value) {
  return value == null ? value : structuredClone(value);
}

function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new TypeError(`${name} must be a non-empty string`);
  }
}

function validateManifest(entry) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    throw new TypeError("manifest entry must be an object");
  }
  const { file, ...manifest } = entry;
  if (!Number.isSafeInteger(manifest.schemaVersion) || manifest.schemaVersion < 1) {
    throw new TypeError("manifest.schemaVersion must be a positive safe integer");
  }
  for (const field of ["id", "displayName", "owner", "maturity", "status"]) {
    assertString(manifest[field], `manifest.${field}`);
  }
  if (!LEGACY_ID.test(manifest.id)) {
    throw new TypeError("manifest.id must use the legacy ap.<name> format");
  }
  if (!Array.isArray(manifest.dependsOn)) {
    throw new TypeError("manifest.dependsOn must be an array");
  }
  const dependencies = [];
  const seen = new Set();
  for (const [index, dependency] of manifest.dependsOn.entries()) {
    assertString(dependency, `manifest.dependsOn[${index}]`);
    if (!LEGACY_ID.test(dependency)) {
      throw new TypeError(`manifest.dependsOn[${index}] must use the legacy ap.<name> format`);
    }
    if (seen.has(dependency)) throw new Error(`manifest.dependsOn contains duplicate value: ${dependency}`);
    seen.add(dependency);
    dependencies.push(dependency);
  }
  if (file != null) assertString(file, "manifest.file");
  return { file: file ?? null, manifest: { ...clone(manifest), dependsOn: dependencies } };
}

export function createLegacyCapabilityIndex(manifests, {
  clock = () => new Date().toISOString(),
} = {}) {
  if (!Array.isArray(manifests)) throw new TypeError("manifests must be an array");
  if (typeof clock !== "function") throw new TypeError("clock must be a function");

  const before = clone(manifests);
  const validated = manifests.map(validateManifest);
  const byId = new Map();

  for (const { manifest } of validated) {
    if (byId.has(manifest.id)) throw new Error(`duplicate capability id: ${manifest.id}`);
    byId.set(manifest.id, manifest);
  }
  for (const { manifest } of validated) {
    for (const dependency of manifest.dependsOn) {
      if (!byId.has(dependency)) throw new Error(`${manifest.id}: missing dependency ${dependency}`);
      if (dependency === manifest.id) throw new Error(`${manifest.id}: self dependency is not allowed`);
    }
  }

  const generatedAt = clock();
  assertString(generatedAt, "clock result");

  const capabilities = validated
    .sort((left, right) => String(left.file).localeCompare(String(right.file)))
    .map(({ file, manifest }) => ({
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
