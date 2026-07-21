#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const INTERNAL_PREFIX = "@apidevelopers/";
const WORKSPACE_DIRS = ["packages", "apps"];

export function collectWorkspaceManifests(rootDir) {
  const manifests = [];
  for (const parent of WORKSPACE_DIRS) {
    const base = path.join(rootDir, parent);
    if (!fs.existsSync(base)) continue;
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const manifestPath = path.join(base, entry.name, "package.json");
      if (!fs.existsSync(manifestPath)) continue;
      manifests.push(manifestPath);
    }
  }
  return manifests.sort();
}

export function validateWorkspace(rootDir = process.cwd()) {
  const errors = [];
  const manifests = collectWorkspaceManifests(rootDir);
  const packages = new Map();

  for (const manifestPath of manifests) {
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch (error) {
      errors.push({
        code: "PREFLIGHT_INVALID_JSON",
        path: path.relative(rootDir, manifestPath),
        message: error.message,
      });
      continue;
    }

    if (!manifest.name) {
      errors.push({
        code: "PREFLIGHT_PACKAGE_NAME_MISSING",
        path: path.relative(rootDir, manifestPath),
        message: "package.json must declare name",
      });
      continue;
    }

    if (packages.has(manifest.name)) {
      errors.push({
        code: "PREFLIGHT_DUPLICATE_PACKAGE_NAME",
        path: path.relative(rootDir, manifestPath),
        message: `${manifest.name} is already declared by ${packages.get(manifest.name).path}`,
      });
      continue;
    }

    packages.set(manifest.name, {
      path: path.relative(rootDir, manifestPath),
      manifest,
    });
  }

  for (const [packageName, entry] of packages) {
    for (const field of ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"]) {
      const dependencies = entry.manifest[field] ?? {};
      for (const [dependencyName, specifier] of Object.entries(dependencies)) {
        if (typeof specifier !== "string") continue;

        if (specifier.startsWith("workspace:")) {
          errors.push({
            code: "PREFLIGHT_UNSUPPORTED_WORKSPACE_PROTOCOL",
            path: entry.path,
            message: `${packageName} uses ${dependencyName}: ${specifier}; repository convention is "*" for internal workspaces`,
          });
        }

        if (dependencyName.startsWith(INTERNAL_PREFIX) && !packages.has(dependencyName)) {
          errors.push({
            code: "PREFLIGHT_INTERNAL_DEPENDENCY_MISSING",
            path: entry.path,
            message: `${packageName} references missing internal package ${dependencyName}`,
          });
        }
      }
    }
  }

  return Object.freeze({
    ok: errors.length === 0,
    rootDir: path.resolve(rootDir),
    manifestCount: manifests.length,
    packageCount: packages.size,
    errors: Object.freeze(errors.map((error) => Object.freeze(error))),
  });
}

function printResult(result) {
  if (result.ok) {
    console.log(
      `reanchor-preflight: ok (${result.packageCount} packages, ${result.manifestCount} manifests)`,
    );
    return;
  }

  console.error(`reanchor-preflight: failed with ${result.errors.length} error(s)`);
  for (const error of result.errors) {
    console.error(`- [${error.code}] ${error.path}: ${error.message}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const rootArg = process.argv.find((arg) => arg.startsWith("--root="));
  const rootDir = rootArg ? path.resolve(rootArg.slice("--root=".length)) : process.cwd();
  const result = validateWorkspace(rootDir);
  printResult(result);
  process.exitCode = result.ok ? 0 : 1;
}
