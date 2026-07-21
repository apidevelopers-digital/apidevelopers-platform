import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import {
  summarizeDiagnostics,
  validateDocumentation,
  validateRegistry,
} from "./lib/capability-validation.mjs";
import {
  loadContract,
  validateAgainstContract,
} from "./lib/contract-validation.mjs";
import {
  loadValidationPolicies,
  resolvePolicyProfile,
  runPolicies,
  shouldFailPolicyRun,
} from "./lib/policy-runner.mjs";

const rootDir = process.cwd();
const capabilitiesDir = path.join(rootDir, "capabilities");
const outputPath = path.join(rootDir, "generated", "capabilities.validation.json");
const manifestContractPath = "contracts/manifest/capability-manifest.schema.json";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

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
  const requestedProfile = readArg("--profile");
  const manifests = await loadManifests();
  const manifestContract = await loadContract(manifestContractPath, rootDir);
  const policyConfig = await loadValidationPolicies(undefined, rootDir);
  const { profileName, profile } = resolvePolicyProfile(policyConfig, requestedProfile);

  const contractDiagnostics = manifests.flatMap((manifest) =>
    validateAgainstContract(manifest, manifestContract, {
      capability: manifest.id ?? null,
    }),
  );

  const { diagnostics: registryDiagnostics } = validateRegistry(manifests);
  const policyDiagnostics = runPolicies(manifests, profileName, profile);
  const documentationDiagnostics = await validateDocumentation(manifests, rootDir);

  const diagnostics = [
    ...contractDiagnostics,
    ...registryDiagnostics,
    ...policyDiagnostics,
    ...documentationDiagnostics,
  ];
  const summary = summarizeDiagnostics(diagnostics);
  const blocked = shouldFailPolicyRun(diagnostics, profile);

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    profile: profileName,
    contract: manifestContractPath,
    capabilityCount: manifests.length,
    blocked,
    failOn: profile.failOn ?? ["error"],
    summary,
    diagnostics,
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(
    `validation complete: profile=${profileName}, ${manifests.length} capabilities, ${summary.error} errors, ${summary.warning} warnings, blocked=${blocked}`,
  );

  if (blocked) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const detail = error instanceof Error
    ? String(error.stack ?? error.message).replaceAll("\n", " :: ")
    : String(error);
  console.error(detail);
  process.exitCode = 1;
});
