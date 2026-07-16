#!/usr/bin/env node

import process from "node:process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const EXPECTED_REPO = "sitedauni/apidevelopers-platform";
const EXPECTED_BRANCH = "foundation/global-platform-bootstrap-20260715";

function check(name, status, details = null) {
  return { name, status, details };
}

function command(command, args = []) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  return {
    ok: result.status === 0,
    stdout: (result.stdout || "").trim(),
    stderr: (result.stderr || "").trim(),
  };
}

async function fileExists(path) {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function githubHealth(token) {
  if (!token) return check("github-token", "blocked", "GITHUB_TOKEN ausente");

  try {
    const response = await fetch("https://api.github.com/rate_limit", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      return check("github-api", "blocked", `HTTP ${response.status}`);
    }

    return check("github-api", "ready", "conectividade autenticada");
  } catch (error) {
    return check("github-api", "attention", error.message);
  }
}

async function main() {
  const root = resolve(process.cwd());
  const checks = [];

  checks.push(
    check(
      "node",
      Number(process.versions.node.split(".")[0]) >= 20 ? "ready" : "blocked",
      process.versions.node,
    ),
  );

  const git = command("git", ["rev-parse", "--is-inside-work-tree"]);
  checks.push(check("git", git.ok && git.stdout === "true" ? "ready" : "blocked", git.stderr || git.stdout));

  const branch = command("git", ["branch", "--show-current"]);
  checks.push(
    check(
      "branch",
      branch.ok && branch.stdout === EXPECTED_BRANCH ? "ready" : "attention",
      branch.stdout || branch.stderr || "indisponível",
    ),
  );

  const remote = command("git", ["remote", "get-url", "origin"]);
  checks.push(
    check(
      "repository",
      remote.ok && remote.stdout.includes(EXPECTED_REPO) ? "ready" : "attention",
      remote.stdout || remote.stderr || "origin indisponível",
    ),
  );

  const requiredFiles = [
    "scripts/publish-github-file.mjs",
    "scripts/validate-publish-file.mjs",
    "scripts/lib/retry-policy.mjs",
    "tests/tooling/publish-pipeline.test.mjs",
  ];

  for (const relativePath of requiredFiles) {
    checks.push(
      check(
        `file:${relativePath}`,
        (await fileExists(resolve(root, relativePath))) ? "ready" : "blocked",
      ),
    );
  }

  const packagePath = resolve(root, "package.json");
  if (await fileExists(packagePath)) {
    try {
      JSON.parse(await readFile(packagePath, "utf8"));
      checks.push(check("package-json", "ready"));
    } catch (error) {
      checks.push(check("package-json", "blocked", error.message));
    }
  } else {
    checks.push(check("package-json", "attention", "package.json ausente"));
  }

  const tests = command(process.execPath, ["--test", "tests/tooling/publish-pipeline.test.mjs"]);
  checks.push(check("publish-tests", tests.ok ? "ready" : "blocked", tests.ok ? "testes aprovados" : tests.stderr));

  checks.push(await githubHealth(process.env.GITHUB_TOKEN));

  const blocked = checks.filter((item) => item.status === "blocked").length;
  const attention = checks.filter((item) => item.status === "attention").length;
  const status = blocked > 0 ? "BLOCKED" : attention > 0 ? "ATTENTION" : "READY";

  const report = {
    ok: status === "READY",
    status,
    generatedAt: new Date().toISOString(),
    expected: { repository: EXPECTED_REPO, branch: EXPECTED_BRANCH },
    summary: { total: checks.length, blocked, attention },
    checks,
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(status === "BLOCKED" ? 1 : 0);
}

main().catch((error) => {
  console.error(JSON.stringify({ ok: false, status: "BLOCKED", error: error.message }, null, 2));
  process.exit(1);
});
