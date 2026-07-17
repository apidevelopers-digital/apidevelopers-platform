
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { createLegacyCapabilityIndex } from "../packages/registry/src/legacy-index.mjs";

const capabilitiesDir = path.resolve("capabilities");
const outputPath = path.resolve("generated/capabilities.index.json");
const checkMode = process.argv.includes("--check");

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

async function loadManifests() {
  const entries = await readdir(capabilitiesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const manifests = [];
  for (const file of files) {
    const raw = await readFile(path.join(capabilitiesDir, file), "utf8");
    manifests.push({ file, ...JSON.parse(raw) });
  }
  return manifests;
}

async function main() {
  try {
    const manifests = await loadManifests();
    const index = createLegacyCapabilityIndex(manifests);

    if (checkMode) {
      console.log(`capability registry valid: ${index.count} capabilities`);
      return;
    }

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    console.log(`capability registry generated: ${index.count} capabilities`);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

await main();
