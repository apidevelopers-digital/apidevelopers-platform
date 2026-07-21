#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const REPORT_LIMIT = 8000;
const root = process.cwd();
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? path.resolve(root, reportArg.slice("--report=".length)) : null;
const filterArg = process.argv.find((arg) => arg.startsWith("--workspace="));
const workspaceFilter = filterArg ? filterArg.slice("--workspace=".length) : null;
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const patterns = Array.isArray(rootManifest.workspaces)
  ? rootManifest.workspaces
  : rootManifest.workspaces/.packages ?? [];

function tail(text, limit = REPORT_LIMIT) {
  const value = String(text ?? "");
  return value.length > limit ? value.slice(-limit) : value;
}

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
        if (!workspaceFilter || manifest.name === workspaceFilter) {
          workspaces.push({ name: manifest.name, path: path.relative(root, manifestPath) });
        }
      }
    } catch {
      // Manifest preflight owns JSON validation.
    }
  }
}

workspaces.sort((a, b) => a.name.localeCompare(b.name));
const results = [];

for (const workspace of workspaces) {
  console.log(`\n==> ${workspace.name} (${workspace.path})`);
  const result = spawnSync("npm", ["test", "--workspace", workspace.name, "--if-present"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 1024 * 1024 * 20,
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  const failed = result.status !== 0;
  results.push({
    name: workspace.name,
    path: workspace.path,
    status: failed ? "failed" : "passed",
    exitCode: result.status,
    signal: result.signal ?? null,
    stdoutTail: failed ? tail(result.stdout) : undefined,
    stderrTail: failed ? tail(result.stderr) : undefined,
  });

  if (failed) {
    console.error(`::error file=${workspace.path},title=Workspace test failed: ${workspace.name}::Exit code ${result.status ?? "unknown"}`);
  }
}

const failures = results.filter((item) => item.status === "failed");
const report = {
  generatedAt: new Date().toISOString(),
  workspaceCount: workspaces.length,
  passedCount: results.length - failures.length,
  failedCount: failures.length,
  failures,
  results,
};

if (reportPath) {
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(`\nTested ${workspaces.length} workspace(s).`);
if (failures.length > 0) {
  console.error(`Failed workspaces: ${failures.map((item) => item.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("All workspace tests passed.");
}
