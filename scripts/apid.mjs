#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const ROOT = resolve(new URL("..", import.meta.url).pathname);

const COMMANDS = Object.freeze({
  doctor: {
    script: "scripts/doctor.mjs",
    description: "Diagnostica ambiente, toolkit e pipeline de publicação.",
  },
  validate: {
    script: "scripts/validate-publish-file.mjs",
    description: "Valida um arquivo antes da publicação.",
  },
  publish: {
    script: "scripts/publish-github-file.mjs",
    description: "Publica com dry-run por padrão e verificação pós-publicação.",
  },
  architecture: {
    script: "scripts/architecture-validate.mjs",
    description: "Executa validação arquitetural canônica.",
  },
  test: {
    nodeArgs: ["--test", "tests/tooling/publish-pipeline.test.mjs"],
    description: "Executa os testes essenciais do pipeline.",
  },
  learning: {
    script: "apps/portal-learning-worker/src/integrated-cycle.mjs",
    description: "Gera fontes reais, publica o snapshot e verifica o endpoint somente leitura.",
  },
});

function help() {
  const lines = [
    "API Developers Engineering Toolkit",
    "",
    "Uso:",
    "  apid <comando> [opções]",
    "",
    "Comandos:",
    ...Object.entries(COMMANDS).map(
      ([name, entry]) => `  ${name.padEnd(12)} ${entry.description}`,
    ),
    "",
    "Arquitetura:",
    "  apid architecture validate [opções]",
    "",
    "Publicação real:",
    "  exige --confirm PUBLISH_GITHUB_FILE_REAL",
    "  sem essa confirmação, o comando permanece em dry-run.",
  ];

  console.log(lines.join("\n"));
}

function fail(message, code = 1) {
  console.error(JSON.stringify({ ok: false, command: "apid", message }, null, 2));
  process.exit(code);
}

function runNode(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    env: process.env,
    stdio: "inherit",
  });

  if (result.error) fail(result.error.message);
  process.exit(result.status ?? 1);
}

function main() {
  const [, , command, ...args] = process.argv;

  if (!command || ["help", "--help", "-h"].includes(command)) {
    help();
    return;
  }

  if (["version", "--version", "-v"].includes(command)) {
    console.log("apid-toolkit 0.2.0");
    return;
  }

  const entry = COMMANDS[command];
  if (!entry) {
    help();
    fail(`Comando desconhecido: ${command}`, 2);
  }

  if (command === "publish") {
    const confirmIndex = args.indexOf("--confirm");
    if (
      confirmIndex >= 0 &&
      args[confirmIndex + 1] !== "PUBLISH_GITHUB_FILE_REAL"
    ) {
      fail(
        "Confirmação inválida. Use exatamente PUBLISH_GITHUB_FILE_REAL para publicação real.",
        3,
      );
    }
  }

  if (command === "architecture") {
    const [subcommand, ...subcommandArgs] = args;
    if (!subcommand || ["help", "--help", "-h"].includes(subcommand)) {
      runNode([resolve(ROOT, entry.script), "--help"]);
      return;
    }
    if (subcommand !== "validate") {
      fail(`Subcomando de architecture desconhecido: ${subcommand}`, 2);
    }
    runNode([resolve(ROOT, entry.script), ...subcommandArgs]);
    return;
  }

  if (entry.nodeArgs) {
    runNode(entry.nodeArgs);
    return;
  }

  runNode([resolve(ROOT, entry.script), ...args]);
}

main();
