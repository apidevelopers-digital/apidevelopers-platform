import fs from "node:fs/promises";
import path from "node:path";

import { runHostingerAgencyPreflight } from "./hostinger-agency-preflight.mjs";

const outputPath = path.resolve(
  process.env.PREFLIGHT_OUTPUT_PATH ??
    "hostinger-agency-preview-preflight.json",
);

const report = await runHostingerAgencyPreflight({
  token: process.env.HOSTINGER_API_TOKEN,
  orderId: process.env.HOSTINGER_AGENCY_ORDER_ID,
  baseUrl:
    process.env.HOSTINGER_API_BASE_URL ??
    "https://developers.hostinger.com",
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");

process.stdout.write(
  `${JSON.stringify({
    kind: report.kind,
    mode: report.mode,
    executable: report.executable,
    writesEnabled: report.writesEnabled,
    datacentersAvailable: report.datacenters.length,
    fingerprint: report.fingerprint,
    outputPath,
  })}\n`,
);
