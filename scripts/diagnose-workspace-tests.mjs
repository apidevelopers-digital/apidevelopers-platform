#!/usr/bin/env node
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const patterns = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces
  : rootManifest.workspaces/.packages ?? [];

const workspaces = [];
for (const pattern of patterns) {
  if (typeof pattern !== "string" || !pattern.endsWith("/*")) continue;
  const base = path.join(root, pattern.slice(0, -2));
  let entries = [];
  try {
    entries = await readdir(base, { withFileTypes: true });
  } catch {
    continue;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(base, entry.name, "package.json");
    try {
      const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
      if (typeof manifest.name === "string" && typeof manifest.scripts?.test === "string") {
        workspaces.push({ name: manifest.name, path: path.relative(root, manifestPath) });
      }
    } catch {
      // The manifest preflight reports JSON and schema failures.
    }
  }
}

workspaces.sort((a, b) => a.name.localeCompare(b.name));
const failures = [];

for (const workspace of workspaces) {
  console.log(`\n==> ${workspace.name} (${workspace.path})`);
  const result = spawnSync("npm", ["test", "--workspace", workspace.name, "--if-present"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  if (result.status !== 0) {
    failures.push({ ...workspace, status: result.status });
    console.error(
      `::error file=${workspace.path},title=Workspace test failed: ${workspace.name}::Exit code ${result.status ?? "unknown"}`,
    );
  }
}

console.log(`\nTested ${workspaces.length} workspace(s).`);
if (failures.length > 0) {
  console.error(`Failed workspaces: ${failures.map((item) => item.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("All workspace tests passed.");
}
