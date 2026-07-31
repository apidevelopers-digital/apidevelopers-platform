import fs from "node:fs/promises";
import path from "node:path";

import { runHostingerHostingPreflight } from "./hostinger-agency-preflight.mjs";

const outputPath = path.resolve(
  process.env.PREFLIGHT_OUTPUT_PATH ??
    "hostinger-business-preview-preflight.json",
);

const orderId =
  process.env.HOSTINGER_HOSTING_ORDER_ID ??
  process.env.HOSTINGER_AGENCY_ORDER_ID;

const report = await runHostingerHostingPreflight({
  token: process.env.HOSTINGER_API_TOKEN,
  orderId,
  baseUrl:
    process.env.HOSTINGER_API_BASE_URL ??
    "https://developers.hostinger.com",
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(
  outputPath,
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

process.stdout.write(
  `${JSON.stringify({
    kind: report.kind,
    product: report.product,
    mode: report.mode,
    executable: report.executable,
    writesEnabled: report.writesEnabled,
    datacentersAvailable: report.datacenters.length,
    fingerprint: report.fingerprint,
    outputPath,
  })}\n`,
);
