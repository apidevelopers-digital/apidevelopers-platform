import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const nodeModulesRoot = path.join(repositoryRoot, "node_modules");
const namespaceRoot = path.join(nodeModulesRoot, "@apidevelopers");

for (const packageName of [
  "contracts",
  "kernel-memory",
  "kernel-reasoning",
  "kernel-reflection",
  "kernel-planning",
  "kernel-decision",
]) {
  rmSync(path.join(namespaceRoot, packageName), { force: true });
}

if (existsSync(namespaceRoot) && readdirSync(namespaceRoot).length === 0) {
  rmSync(namespaceRoot, { recursive: true, force: true });
}
if (existsSync(nodeModulesRoot) && readdirSync(nodeModulesRoot).length === 0) {
  rmSync(nodeModulesRoot, { recursive: true, force: true });
}
