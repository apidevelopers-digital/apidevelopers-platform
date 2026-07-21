#!/usr/bin/env node
import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const reportArg = process.argv.find((arg) => arg.startsWith("--report="));
const reportPath = reportArg ? path.resolve(root, reportArg.slice("--report=".length)) : null;
const rootManifest = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
const patterns = Array.isArray(rootManifest.workspaces) ? rootManifest.workspaces : [];
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
    } catch {}
  }
}

workspaces.sort((a, b) => a.name.localeCompare(b.name));
const results = [];

for (const workspace of workspaces) {
  const result = spawnSync("npm", ["test", "--workspace", workspace.name, "--if-present"], {
    cwd: root,
    encoding: "utf8",
    env: process.env,
    maxBuffer: 20 * 1024 * 1024,
  });
  const failed = result.status !== 0;
  results.push({
    name: workspace.name,
    path: workspace.path,
    status: failed ? "failed" : "passed",
    exitCode: result.status,
    signal: result.signal ?? null,
    stdoutTail: failed ? String(result.stdout ?? "").slice(-8000) : undefined,
    stderrTail: failed ? String(result.stderr ?? "").slice(-8000) : undefined,
  });
  console.log(`${failed ? "FAIL" : "PASS"} ${workspace.name}`);
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

if (failures.length > 0) {
  console.error(`Failed workspaces: ${failures.map((item) => item.name).join(", ")}`);
  process.exitCode = 1;
} else {
  console.log("All workspace tests passed.");
}
