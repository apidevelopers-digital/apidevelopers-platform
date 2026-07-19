import { readFile } from "node:fs/promises";

const requiredDocs = [
  "docs/operations/PROPOSTA_PROTECAO_MAIN_E_CHECKS_2026-07-19.md",
  "docs/operations/PLANO_RELEASE_0_1_0_2026-07-19.md",
  "docs/operations/POLITICA_PROMOCAO_ROLLBACK_RUNNER_2026-07-19.md",
];

const raw = await readFile("docs/operations/institutional-readiness.v1.json", "utf8");
const manifest = JSON.parse(raw);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(manifest.schemaVersion === 1, "schemaVersion must be 1");
assert(manifest.repository === "sitedauni/apidevelopers-platform", "repository mismatch");
assert(manifest.targetBranch === "main", "targetBranch must be main");
assert(manifest.status === "proposal-prepared", "status must remain proposal-prepared");
assert(manifest.readinessPercent === 98, "readiness must remain 98 before applied protection");
assert(manifest.requiredCheckProposal === "Platform CI / validate", "required check mismatch");
assert(manifest.requiredHumanApprovalsProposal === 1, "one human approval must be proposed");

const labels = manifest.runner?.labels ?? [];
for (const label of ["self-hosted", "macOS", "X64"]) {
  assert(labels.includes(label), `runner label missing: ${label}`);
}
assert(manifest.runner?.productionServer === false, "runner must not be production");

const controls = manifest.controls ?? {};
for (const field of [
  "branchProtectionApplied",
  "mergeAuthorized",
  "releaseAuthorized",
  "packagePublicationAuthorized",
  "deployAuthorized",
  "autoMergeAllowed",
  "forcePushAllowed",
  "branchDeletionAllowed",
]) {
  assert(controls[field] === false, `${field} must remain false`);
}

assert(manifest.decision?.milena === "NOT_INFORMED", "Milena decision must remain NOT_INFORMED");
assert(
  manifest.decision?.igorExecutionAuthorization === "NOT_GRANTED",
  "Igor execution authorization must remain NOT_GRANTED",
);
assert(
  manifest.nextAllowedState === "explicit-human-approval-for-main-protection",
  "nextAllowedState mismatch",
);

for (const path of requiredDocs) {
  const content = await readFile(path, "utf8");
  assert(content.length > 500, `${path} is unexpectedly short`);
  assert(/NÃO APLICADA|NÃO AUTORIZADO|PROPOSTA OPERACIONAL/.test(content), `${path} lacks proposal boundary`);
}

console.log("institutional readiness proposal validated");
