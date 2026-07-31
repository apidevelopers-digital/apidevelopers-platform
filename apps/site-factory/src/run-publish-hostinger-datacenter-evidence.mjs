import fs from "node:fs/promises";
import {
  buildDatacenterEvidence,
  publishDatacenterEvidence,
} from "./hostinger-datacenter-evidence.mjs";

function env(name) {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`missing_environment:${name}`);
  return value.trim();
}

const preflight = JSON.parse(
  await fs.readFile(env("PREFLIGHT_OUTPUT_PATH"), "utf8"),
);
const evidence = buildDatacenterEvidence({
  preflight,
  repository: env("GITHUB_REPOSITORY"),
  sha: env("GITHUB_SHA"),
  runId: env("GITHUB_RUN_ID"),
});
const result = await publishDatacenterEvidence({
  token: env("GITHUB_TOKEN"),
  repository: env("GITHUB_REPOSITORY"),
  sourceSha: env("GITHUB_SHA"),
  evidence,
});

process.stdout.write(
  `${JSON.stringify({
    kind: evidence.kind,
    executable: evidence.executable,
    hostingerWrites: evidence.hostingerWrites,
    datacenters: evidence.datacenters.length,
    fingerprint: evidence.fingerprint,
    ...result,
  })}\n`,
);
