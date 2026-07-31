import fs from "node:fs/promises";
import path from "node:path";

import { createHostingerWebsiteCreateDraft } from "./hostinger-website-create-draft.mjs";

function parseArgs(argv) {
  const args = {};

  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];

    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`invalid_argument:${key ?? "missing"}`);
    }

    args[key.slice(2)] = value;
  }

  return args;
}

function requiredArg(args, name) {
  const value = args[name];

  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_argument:${name}`);
  }

  return value.trim();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

const args = parseArgs(process.argv.slice(2));
const manifest = await readJson(path.resolve(requiredArg(args, "manifest")));
const preflightReport = await readJson(
  path.resolve(requiredArg(args, "preflight")),
);
const outputPath = path.resolve(requiredArg(args, "output"));

const expectedDomain = manifest?.publication?.targetDomain;
const draft = createHostingerWebsiteCreateDraft({
  domain: expectedDomain,
  expectedDomain,
  orderId: requiredArg(args, "order-id"),
  datacenterCode: requiredArg(args, "datacenter-code"),
  preflightReport,
  sourceRepository: requiredArg(args, "repository"),
  sourceSha: requiredArg(args, "source-sha"),
  generatedAt: args["generated-at"] ?? new Date().toISOString(),
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(draft, null, 2)}\n`, "utf8");

process.stdout.write(
  `${JSON.stringify({
    kind: draft.kind,
    mode: draft.mode,
    executable: draft.executable,
    approvalRequired: draft.approvalRequired,
    targetDomain: draft.request.payload.domain,
    datacenterCode: draft.request.payload.datacenter_code,
    sourceSha: draft.source.sha,
    fingerprint: draft.fingerprint,
    approvalToken: draft.approvalToken,
    outputPath,
  })}\n`,
);
