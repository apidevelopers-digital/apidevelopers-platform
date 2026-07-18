#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const auditDir = join(root, ".audit");
mkdirSync(auditDir, { recursive: true });

const ignored = new Set([".git", "node_modules", ".audit", "dist", "build", "coverage"]);
const codeExt = new Set([".js", ".mjs", ".cjs", ".ts", ".tsx", ".jsx", ".py", ".go", ".rs", ".java", ".php"]);
const docExt = new Set([".md", ".mdx", ".txt", ".rst"]);
const configNames = new Set(["package.json", "tsconfig.json", "Dockerfile", "docker-compose.yml", "docker-compose.yaml"]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (ignored.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function git(...args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function classify(path) {
  const ext = extname(path).toLowerCase();
  const name = path.split("/").pop();
  if (path.includes("/test/") || path.includes("/tests/") || name?.includes(".test.") || name?.includes(".spec.")) return "test";
  if (codeExt.has(ext)) return "code";
  if (docExt.has(ext)) return "documentation";
  if (configNames.has(name) || [".json", ".yml", ".yaml", ".toml"].includes(ext)) return "configuration";
  return "other";
}

const files = walk(root)
  .map((file) => {
    const path = relative(root, file).replaceAll("\\", "/");
    return { path, size: statSync(file).size, sha256: sha256(file), kind: classify(path) };
  })
  .sort((a, b) => a.path.localeCompare(b.path));

const packages = files.filter((f) => f.path.endsWith("package.json")).map((f) => {
  try {
    const data = JSON.parse(readFileSync(join(root, f.path), "utf8"));
    return {
      path: f.path,
      name: data.name ?? null,
      version: data.version ?? null,
      private: Boolean(data.private),
      scripts: Object.keys(data.scripts ?? {}).sort(),
      dependencies: Object.keys(data.dependencies ?? {}).sort(),
      devDependencies: Object.keys(data.devDependencies ?? {}).sort()
    };
  } catch {
    return { path: f.path, parseError: true };
  }
});

const topLevel = readdirSync(root)
  .filter((name) => !ignored.has(name))
  .map((name) => ({ name, type: statSync(join(root, name)).isDirectory() ? "directory" : "file" }))
  .sort((a, b) => a.name.localeCompare(b.name));

const previousPath = join(auditDir, "snapshot.json");
let previous = null;
if (existsSync(previousPath)) {
  try { previous = JSON.parse(readFileSync(previousPath, "utf8")); } catch {}
}

const currentHashes = new Map(files.map((f) => [f.path, f.sha256]));
const previousHashes = new Map((previous?.files ?? []).map((f) => [f.path, f.sha256]));
const added = files.filter((f) => !previousHashes.has(f.path)).map((f) => f.path);
const changed = files.filter((f) => previousHashes.has(f.path) && previousHashes.get(f.path) !== f.sha256).map((f) => f.path);
const removed = [...previousHashes.keys()].filter((path) => !currentHashes.has(path));

const snapshot = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  repository: process.env.GITHUB_REPOSITORY ?? null,
  branch: process.env.GITHUB_REF_NAME ?? git("branch", "--show-current"),
  commit: process.env.GITHUB_SHA ?? git("rev-parse", "HEAD"),
  baseCommit: previous?.commit ?? null,
  summary: {
    files: files.length,
    packages: packages.length,
    code: files.filter((f) => f.kind === "code").length,
    documentation: files.filter((f) => f.kind === "documentation").length,
    configuration: files.filter((f) => f.kind === "configuration").length,
    tests: files.filter((f) => f.kind === "test").length
  },
  delta: { added, changed, removed },
  topLevel,
  packages,
  files
};

writeFileSync(previousPath, JSON.stringify(snapshot, null, 2) + "\n");

const report = `# Institutional Audit Snapshot

**Generated:** ${snapshot.generatedAt}  
**Branch:** \`${snapshot.branch}\`  
**Commit:** \`${snapshot.commit}\`

## Summary

| Metric | Count |
|---|---:|
| Files | ${snapshot.summary.files} |
| Packages | ${snapshot.summary.packages} |
| Code files | ${snapshot.summary.code} |
| Documentation files | ${snapshot.summary.documentation} |
| Configuration files | ${snapshot.summary.configuration} |
| Test files | ${snapshot.summary.tests} |

## Delta from previous snapshot

| Change | Count |
|---|---:|
| Added | ${added.length} |
| Changed | ${changed.length} |
| Removed | ${removed.length} |

## Top-level structure

${topLevel.map((item) => `- \`${item.name}\` — ${item.type}`).join("\n")}

## Packages

${packages.length ? packages.map((pkg) => `- \`${pkg.name ?? "(unnamed)"}\` — \`${pkg.path}\`${pkg.parseError ? " — parse error" : ""}`).join("\n") : "_No package manifests found._"}

## Continuity

This snapshot is generated automatically. Future runs compare file hashes against the previous committed snapshot, so the audit continues incrementally instead of restarting from zero.
`;

writeFileSync(join(auditDir, "report.md"), report);
console.log(`Audit complete: ${files.length} files, ${packages.length} package manifests.`);
