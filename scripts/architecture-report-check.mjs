#!/usr/bin/env node

import { appendFile, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import {
  RESULT_STATES,
  verifyValidationReport,
} from "../packages/architecture-rule-engine/src/index.mjs";

function help() {
  console.log([
    "Architecture Validation Report Check",
    "",
    "Uso:",
    "  node scripts/architecture-report-check.mjs <validation-report.json>",
    "",
    "Valida:",
    "  - JSON legível;",
    "  - estado canônico conhecido;",
    "  - integridade SHA-256 do relatório;",
    "  - contadores mínimos do resumo.",
  ].join("\n"));
}

function fail(code, message, details = {}) {
  console.error(JSON.stringify({
    ok: false,
    command: "architecture-report-check",
    code,
    message,
    details,
  }, null, 2));
  process.exit(2);
}

function requireNonNegativeInteger(value, field) {
  if (!Number.isInteger(value) || value < 0) {
    fail("REPORT_SUMMARY_INVALID", `${field} must be a non-negative integer.`, {
      field,
      observed: value ?? null,
    });
  }
}

async function writeGithubMetadata(summary) {
  if (process.env.GITHUB_OUTPUT) {
    const output = [
      `result=${summary.result}`,
      `finding_count=${summary.findingCount}`,
      `blocking_finding_count=${summary.blockingFindingCount}`,
      `report_id=${summary.reportId}`,
      `integrity=${summary.integrity}`,
      "",
    ].join("\n");
    await appendFile(process.env.GITHUB_OUTPUT, output, "utf8");
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const markdown = [
      "## Architecture validation",
      "",
      `- Result: \`${summary.result}\``,
      `- Findings: **${summary.findingCount}**`,
      `- Blocking findings: **${summary.blockingFindingCount}**`,
      `- Report ID: \`${summary.reportId}\``,
      `- Integrity: \`${summary.integrity}\``,
      "",
    ].join("\n");
    await appendFile(process.env.GITHUB_STEP_SUMMARY, markdown, "utf8");
  }
}

async function main() {
  const [argument, ...extra] = process.argv.slice(2);

  if (!argument || ["-h", "--help", "help"].includes(argument)) {
    help();
    return;
  }

  if (extra.length > 0) {
    fail("ARGUMENTS_INVALID", "Only one report path is accepted.", { extra });
  }

  const reportPath = path.resolve(process.cwd(), argument);
  let report;

  try {
    report = JSON.parse(await readFile(reportPath, "utf8"));
  } catch (error) {
    fail("REPORT_JSON_INVALID", "Unable to read a valid JSON report.", {
      path: argument,
      cause: error.message,
    });
  }

  const result = report?.summary?.result;
  if (!RESULT_STATES.includes(result)) {
    fail("REPORT_RESULT_INVALID", "Report result is not canonical.", {
      observed: result ?? null,
      allowed: RESULT_STATES,
    });
  }

  requireNonNegativeInteger(report?.summary?.findingCount, "summary.findingCount");
  requireNonNegativeInteger(
    report?.summary?.blockingFindingCount,
    "summary.blockingFindingCount",
  );

  if (typeof report?.reportId !== "string" || report.reportId.length === 0) {
    fail("REPORT_ID_INVALID", "reportId must be a non-empty string.");
  }

  if (!verifyValidationReport(report)) {
    fail("REPORT_INTEGRITY_INVALID", "Canonical report integrity verification failed.", {
      reportId: report.reportId,
    });
  }

  const summary = Object.freeze({
    result,
    findingCount: report.summary.findingCount,
    blockingFindingCount: report.summary.blockingFindingCount,
    reportId: report.reportId,
    integrity: report.integrity.report,
  });

  await writeGithubMetadata(summary);

  console.log(JSON.stringify({
    ok: true,
    command: "architecture-report-check",
    ...summary,
  }, null, 2));
}

main().catch((error) => {
  fail("REPORT_CHECK_FAILED", error.message, {
    name: error.name,
    code: error.code ?? null,
  });
});
