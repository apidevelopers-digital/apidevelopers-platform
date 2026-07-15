import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const capabilitiesDir = path.resolve("capabilities");
const outputPath = path.resolve("generated/capabilities.index.json");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function assertString(value, field, file) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${file}: ${field} must be a non-empty string`);
  }
}

async function loadManifests() {
  const entries = await readdir(capabilitiesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const manifests = [];

  for (const file of files) {
    const fullPath = path.join(capabilitiesDir, file);
    const raw = await readFile(fullPath, "utf8");
    const manifest = JSON.parse(raw);

    assertString(manifest.id, "id", file);
    assertString(manifest.displayName, "displayName", file);
    assertString(manifest.owner, "owner", file);
    assertString(manifest.maturity, "maturity", file);
    assertString(manifest.status, "status", file);

    if (!Array.isArray(manifest.dependsOn)) {
      throw new Error(`${file}: dependsOn must be an array`);
    }

    manifests.push({ file, ...manifest });
  }

  return manifests;
}

function validateRegistry(manifests) {
  const byId = new Map();

  for (const manifest of manifests) {
    if (byId.has(manifest.id)) {
      throw new Error(`duplicate capability id: ${manifest.id}`);
    }
    byId.set(manifest.id, manifest);
  }

  for (const manifest of manifests) {
    for (const dependency of manifest.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`${manifest.id}: missing dependency ${dependency}`);
      }
      if (dependency === manifest.id) {
        throw new Error(`${manifest.id}: self dependency is not allowed`);
      }
    }
  }

  return byId;
}

function buildIndex(manifests) {
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    count: manifests.length,
    capabilities: manifests.map(({ file, ...manifest }) => ({
      ...manifest,
      source: `capabilities/${file}`,
    })),
  };
}

async function main() {
  try {
    const manifests = await loadManifests();
    validateRegistry(manifests);

    const index = buildIndex(manifests);
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

    console.log(`capability registry generated: ${index.count} capabilities`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

await main();
