#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function evaluateProductionReadinessReport(report, { requireParent = false } = {}) {
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    throw new TypeError("readiness report must be an object");
  }

  const productionValid = report?.targets?.productionDomain?.valid === true;
  const parentValid = report?.targets?.hostingerParent?.valid === true;
  const parentRequired = requireParent === true;

  return Object.freeze({
    productionValid,
    parentValid,
    parentRequired,
    healthy: productionValid && (!parentRequired || parentValid),
    classification: report.classification ?? null,
  });
}

function parseBoolean(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError(name + " must be true or false");
}

function isDirectExecution() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]));
  } catch {
    return false;
  }
}

export async function runProductionReadinessEnforcement({
  reportPath = process.argv[2],
  env = process.env,
} = {}) {
  if (!reportPath) {
    throw new TypeError("report path is required");
  }

  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const result = evaluateProductionReadinessReport(report, {
    requireParent: parseBoolean(env.GATEWAY_REQUIRE_PARENT_READY, "GATEWAY_REQUIRE_PARENT_READY"),
  });

  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  if (!result.healthy) process.exitCode = 1;
  return result;
}

if (isDirectExecution()) {
  runProductionReadinessEnforcement().catch((error) => {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + "\n");
    process.exitCode = 1;
  });
}
