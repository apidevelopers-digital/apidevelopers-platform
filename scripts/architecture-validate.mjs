#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function help() {
  console.log([
    "API Developers Architecture Validation",
    "",
    "Uso:",
    "  apid architecture validate [opções]",
    "",
    "Opções:",
    "  --scope repository|changed-files|paths",
    "  --base-sha <sha>          Base para changed-files",
    "  --head-sha <sha>          Head para changed-files",
    "  --path <arquivo>          Repita para scope=paths",
    "  --branch <nome>           Sobrescreve a branch detectada",
    "  --commit-sha <sha>        Sobrescreve o commit detectado",
    "  --output <arquivo>        Padrão: artifacts/architecture/validation-report.json",
    "  --stdout                  Imprime o relatório canônico completo",
    "  --no-write                Não grava artefato",
    "  -h, --help                Mostra esta ajuda",
  ].join("\n"));
}

function fail(message, code = 2, details = {}) {
  console.error(JSON.stringify({
    ok: false,
    command: "apid architecture validate",
    message,
    details,
  }, null, 2));
  process.exit(code);
}

function git(args) {
  try {
    return execFileSync("git", args, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    fail("Não foi possível obter metadados Git.", 2, {
      args,
      stderr: error?.stderr?.toString?.().trim?.() ?? "",
    });
  }
}

function takeOption(args, name) {
  const index = args.indexOf(name);
  if (index < 0) return null;
  const value = args[index + 1];
  if (!value || value.startsWith("--")) fail(`A opção ${name} exige um valor.`);
  args.splice(index, 2);
  return value;
}

function takeMany(args, name) {
  const values = [];
  while (args.includes(name)) values.push(takeOption(args, name));
  return values;
}

function parseArguments(argv) {
  const args = [...argv];
  if (args.some((item) => ["-h", "--help"].includes(item))) return { help: true };

  const scopeMode = takeOption(args, "--scope") ?? "repository";
  if (!["repository", "changed-files", "paths"].includes(scopeMode)) {
    fail(`Scope inválido: ${scopeMode}`);
  }

  const options = {
    help: false,
    scopeMode,
    baseSha: takeOption(args, "--base-sha"),
    headSha: takeOption(args, "--head-sha"),
    paths: takeMany(args, "--path"),
    branch: takeOption(args, "--branch"),
    commitSha: takeOption(args, "--commit-sha"),
    output: takeOption(args, "--output")
      ?? "artifacts/architecture/validation-report.json",
    stdout: args.includes("--stdout"),
    write: !args.includes("--no-write"),
  };

  for (const flag of ["--stdout", "--no-write"]) {
    let index;
    while ((index = args.indexOf(flag)) >= 0) args.splice(index, 1);
  }

  if (args.length > 0) fail(`Opções desconhecidas: ${args.join(" ")}`);

  if (scopeMode === "changed-files" && !options.baseSha) {
    fail("--base-sha é obrigatório para scope=changed-files.");
  }
  if (scopeMode === "paths" && options.paths.length === 0) {
    fail("--path é obrigatório para scope=paths.");
  }

  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    help();
    return;
  }

  const [
    { createFilesystemRepository },
    { buildArchitectureValidationInput, validateArchitecture },
  ] = await Promise.all([
    import("../packages/architecture-rule-engine/src/filesystem-repository.mjs"),
    import("../packages/architecture-rule-engine/src/validation-service.mjs"),
  ]);

  const branch = options.branch ?? (git(["branch", "--show-current"]) || "detached");
  const commitSha = options.commitSha ?? git(["rev-parse", "HEAD"]);
  const headSha = options.headSha ?? commitSha;
  const changedFiles = options.scopeMode === "changed-files"
    ? git(["diff", "--name-only", `${options.baseSha}...${headSha}`])
        .split("\n")
        .filter(Boolean)
    : [];

  const scope = {
    mode: options.scopeMode,
    include: ["**"],
    exclude: [".git/**", "node_modules/**", "artifacts/**"],
  };

  if (options.scopeMode === "changed-files") {
    scope.baseSha = options.baseSha;
    scope.headSha = headSha;
  }
  if (options.scopeMode === "paths") scope.paths = options.paths;

  const repository = createFilesystemRepository(ROOT);
  const input = buildArchitectureValidationInput({
    branch,
    commitSha,
    scope,
  });

  const result = await validateArchitecture({
    input,
    repository,
    changedFiles,
  });

  if (options.write) {
    const outputPath = path.resolve(ROOT, options.output);
    const relative = path.relative(ROOT, outputPath);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      fail("O arquivo de saída deve permanecer dentro do repositório.");
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, result.canonicalJson, "utf8");
  }

  if (options.stdout) {
    process.stdout.write(result.canonicalJson);
  } else {
    console.log(JSON.stringify({
      ok: result.report.summary.result === "COMPLIANT"
        || result.report.summary.result === "CONDITIONAL",
      command: "apid architecture validate",
      result: result.report.summary.result,
      findingCount: result.report.summary.findingCount,
      blockingFindingCount: result.report.summary.blockingFindingCount,
      resolvedFileCount: result.runtime.resolvedFileCount,
      reportId: result.report.reportId,
      output: options.write ? options.output : null,
      integrity: result.report.integrity.report,
    }, null, 2));
  }

  process.exitCode = result.report.execution.exitCode;
}

main().catch((error) => {
  fail(error.message, 2, {
    name: error.name,
    code: error.code ?? null,
  });
});
