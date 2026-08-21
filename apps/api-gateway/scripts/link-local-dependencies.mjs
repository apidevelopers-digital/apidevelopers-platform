import { lstat, mkdir, rm, symlink } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url));
const REPOSITORY_ROOT = resolve(
  process.env.GITHUB_WORKSPACE ?? resolve(SCRIPT_DIRECTORY, "../../.."),
);

const links = Object.freeze([
  ["apps/api-gateway", "contracts"],
  ["apps/api-gateway", "auth-core"],
  ["apps/api-gateway", "apikey-core"],
  ["apps/api-gateway", "persistence-core"],
  ["apps/api-gateway", "saas-runtime"],
  ["apps/api-gateway", "trust-governance-runtime"],
  ["packages/auth-core", "apikey-core"],
  ["packages/apikey-core", "persistence-core"],
  ["packages/saas-runtime", "contracts"],
  ["packages/saas-runtime", "auth-core"],
  ["packages/saas-runtime", "persistence-core"],
  ["packages/trust-governance-runtime", "contracts"],
  ["packages/trust-governance-runtime", "kernel-planning"],
  ["packages/trust-governance-runtime", "kernel-decision"],
  ["packages/trust-governance-runtime", "kernel-policy"],
  ["packages/trust-governance-runtime", "kernel-runtime"],
  ["packages/trust-governance-runtime", "kernel-evidence"],
  ["packages/trust-governance-runtime", "kernel-audit"],
  ["packages/kernel-planning", "contracts"],
  ["packages/kernel-decision", "contracts"],
  ["packages/kernel-policy", "contracts"],
  ["packages/kernel-runtime", "contracts"],
  ["packages/kernel-evidence", "contracts"],
  ["packages/kernel-audit", "contracts"],
  ["packages/kernel-audit", "kernel-evidence"],
]);

async function ensureLink(ownerDirectory, dependencyDirectory) {
  const target = join(REPOSITORY_ROOT, "packages", dependencyDirectory);
  const scope = join(
    REPOSITORY_ROOT,
    ownerDirectory,
    "node_modules",
    "@apidevelopers",
  );
  const destination = join(scope, dependencyDirectory);

  await mkdir(scope, { recursive: true });

  try {
    const current = await lstat(destination);
    if (!current.isSymbolicLink()) {
      throw new Error(`local_dependency_link_conflict:${destination}`);
    }
    await rm(destination, { force: true });
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  await symlink(target, destination, "dir");
}

for (const [ownerDirectory, dependencyDirectory] of links) {
  await ensureLink(ownerDirectory, dependencyDirectory);
}
