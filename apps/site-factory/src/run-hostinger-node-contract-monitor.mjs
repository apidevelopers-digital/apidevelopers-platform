import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createHostingerNodeContractMonitorReport } from "./hostinger-node-contract-monitor.mjs";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error("invalid_arguments");
    }
    values[key.slice(2)] = value;
  }

  for (const required of ["openapi", "issue", "output"]) {
    if (!values[required]) {
      throw new Error(`missing_argument:${required}`);
    }
  }

  return values;
}

export function runHostingerNodeContractMonitor(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const openapi = JSON.parse(fs.readFileSync(args.openapi, "utf8"));
  const issue = JSON.parse(fs.readFileSync(args.issue, "utf8"));
  const report = createHostingerNodeContractMonitorReport({
    openapi,
    issue,
    observedAt: process.env.MONITOR_OBSERVED_AT || new Date().toISOString(),
  });

  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(
    `${JSON.stringify({
      status: report.status,
      reviewRequired: report.reviewRequired,
      fingerprint: report.fingerprint,
    })}\n`,
  );

  return report.reviewRequired ? 2 : 0;
}

const isDirectExecution =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isDirectExecution) {
  try {
    process.exitCode = runHostingerNodeContractMonitor();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 3;
  }
}
