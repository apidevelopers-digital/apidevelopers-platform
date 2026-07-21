#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log([
    "Workspace Manifest Check",
    "",
    "Uso:",
    "  node scripts/check-workspace-manifests.mjs [--root <diretorio>]",
    "",
    "Valida:",
    "  - JSON dos manifests;",
    "  - nomes e versões obrigatórios;",
    "  - nomes de pacotes duplicados;",
    "  - protocolos workspace:* incompatíveis com npm.",
  ].join("\n"));
}

function fail(code, message, details = {}) {
  console.error(JSON.stringify({
    ok: false,
    command: "workspace-manifests-check",
    code,
    message,
    details,
  }, null, 2));
  process.exit(1);
}

function parseArguments(argv) {
  const args = [...argv];
  if (args.some((item) => ["-h", "--help", "help"].includes(item))) return { help: true, root: DEFAULT_ROOT };
  const index = args.indexOf("--root");
  let root = DEFAULT_ROOT;
  if (index >= 0) {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) fail("ARGUMENT_REQUIRED", "--root exige um diretório.");
    root = path.resolve(value);
    args.splice(index, 2);
  }
  if (args.length > 0) fail("ARGUMENTS_INVALID", "Opções desconhecidas.", { args });
  return { help: false, root };
}

async function readJson(filePath) {
  let text;
  try {
    text = await readFile(filePath, "utf8");
  } catch (error) {
    fail("MANIFEST_READ_FAILED", "Não foi possível ler um manifesto.", {
      path: filePath,
      cause: error.message,
    });
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    fail("MANIFEST_JSON_INVALID", "Manifesto contém JSON inválido.", {
      path: filePath,
      cause: error.message,
    });
  }
}

async function exists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function expandWorkspace(root, pattern) {
  if (typeof pattern !== "string" || !pattern.endsWith("/*") || pattern.includes("**")) {
    fail("WORKSPACE_PATTERN_UNSUPPORTED", "Somente padrões simples <diretório>/* são aceitos.", { pattern });
  }

  const base = pattern.slice(0, -2);
  const absoluteBase = path.join(root, ...base.split("/"));
  if (!(await exists(absoluteBase))) return [];

  const entries = await readdir(absoluteBase, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
    .map((entry) => path.join(absoluteBase, entry.name, "package.json"))
    .sort();
}

function dependencyEntries(manifest) {
  const sections = ["dependencies", "devDependencies", "optionalDependencies", "peerDependencies"];
  return sections.flatMap((section) =>
    Object.entries(manifest[section] ?? {}).map(([name, specification]) => ({
      section,
      name,
      specification,
    })),
  );
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    help();
    return;
  }

  const rootManifestPath = path.join(options.root, "package.json");
  const rootManifest = await readJson(rootManifestPath);
  const workspacePatterns = Array.isArray(rootManifest.workspaces)
    ? rootManifest.workspaces
    : rootManifest.workspaces?.packages;

  if (!Array.isArray(workspacePatterns) || workspacePatterns.length === 0) {
    fail("WORKSPACES_REQUIRED", "O manifesto raiz deve declarar workspaces.");
  }

  const candidates = [];
  for (const pattern of workspacePatterns) {
    candidates.push(...await expandWorkspace(options.root, pattern));
  }

  const manifestPaths = [...new Set(candidates)].filter(async () => true);
  const packages = [];
  for (const manifestPath of manifestPaths) {
    if (!(await exists(manifestPath))) continue;
    const manifest = await readJson(manifestPath);
    const relativePath = path.relative(options.root, manifestPath).split(path.sep).join("/");

    if (typeof manifest.name !== "string" || manifest.name.length === 0) {
      fail("PACKAGE_NAME_REQUIRED", "Workspace sem nome válido.", { path: relativePath });
    }
    if (typeof manifest.version !== "string" || manifest.version.length === 0) {
      fail("PACKAGE_VERSION_REQUIRED", "Workspace sem versão válida.", { path: relativePath, name: manifest.name });
    }

    for (const dependency of dependencyEntries(manifest)) {
      if (typeof dependency.specification === "string" && dependency.specification.startsWith("workspace:")) {
        fail("WORKSPACE_PROTOCOL_UNSUPPORTED", "Protocolo workspace: não é aceito pelo npm desta fábrica.", {
          path: relativePath,
          package: manifest.name,
          dependency: dependency.name,
          section: dependency.section,
          specification: dependency.specification,
        });
      }
    }

    packages.push({ name: manifest.name, version: manifest.version, path: relativePath });
  }

  const byName = new Map();
  for (const workspace of packages) {
    if (byName.has(workspace.name)) {
      fail("DUPLICATE_PACKAGE_NAME", "Nome de workspace duplicado.", {
        name: workspace.name,
        paths: [byName.get(workspace.name), workspace.path].sort(),
      });
    }
    byName.set(workspace.name, workspace.path);
  }

  packages.sort((a, b) => a.name.localeCompare(b.name) || a.path.localeCompare(b.path));
  console.log(JSON.stringify({
    ok: true,
    command: "workspace-manifests-check",
    workspaceCount: packages.length,
    workspaces: packages,
  }, null, 2));
}

main().catch((error) => {
  fail("WORKSPACE_CHECK_FAILED", error.message, {
    name: error.name,
    code: error.code ?? null,
  });
});
