import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  summarizeDiagnostics,
  validateDocumentation,
  validateRegistry,
} from "./lib/capability-validation.mjs";

const rootDir = process.cwd();
const capabilitiesDir = path.join(rootDir, "capabilities");
const outputPath = path.join(rootDir, "generated", "capabilities.validation.json");

async function loadManifests() {
  const entries = await readdir(capabilitiesDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();

  const manifests = [];
  for (const file of files) {
    const source = path.join("capabilities", file);
    const raw = await readFile(path.join(capabilitiesDir, file), "utf8");
    manifests.push({ ...JSON.parse(raw), source });
  }

  return manifests;
}

async function main() {
  const manifests = await loadManifests();
  const { diagnostics: registryDiagnostics } = validateRegistry(manifests);
  const documentationDiagnostics = await validateDocumentation(manifests, rootDir);
  const diagnostics = [...registryDiagnostics, ...documentationDiagnostics];
  const summary = summarizeDiagnostics(diagnostics);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    capabilityCount: manifests.length,
    summary,
    diagnostics,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`validation complete: ${manifests.length} capabilities, {summary.error} errors, ${summary.warning} warnings`);

  if (summary.error > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
