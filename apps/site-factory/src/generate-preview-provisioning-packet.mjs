import fs from "node:fs/promises";
import path from "node:path";

import { createPreviewPromotionPlan } from "./preview-promotion.mjs";
import { createPreviewReadinessReport } from "./preview-readiness.mjs";
import { createPreviewProvisioningRequest } from "./preview-provisioning-request.mjs";
import { createPreviewProvisioningPacket } from "./preview-provisioning-packet.mjs";

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

function required(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_argument:${name}`);
  }
  return value.trim();
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

const args = parseArgs(process.argv.slice(2));

const manifestPath = path.resolve(required(args, "manifest"));
const snapshotPath = path.resolve(required(args, "snapshot"));
const outputDirectory = path.resolve(required(args, "output"));
const sourceSha = required(args, "source-sha");
const sourceRepository = required(args, "repository");
const artifactName = required(args, "artifact-name");
const generatedAt = required(args, "generated-at");

const manifest = await readJson(manifestPath);
const snapshot = await readJson(snapshotPath);

if (snapshot.provider !== "hostinger") {
  throw new Error("unsupported_snapshot_provider");
}
if (snapshot.dns?.previewRecordExists !== false || snapshot.dns?.wildcardExists !== false) {
  throw new Error("preview_dns_snapshot_must_be_clear");
}

const promotionPlan = createPreviewPromotionPlan({
  manifest,
  sourceRepository,
  sourceSha,
  artifactName,
  generatedAt,
});

const readinessReport = createPreviewReadinessReport({
  promotionPlan,
  hostingerSnapshot: { data: snapshot.websites ?? [] },
  checkedAt: snapshot.capturedAt,
});

const provisioningRequest = createPreviewProvisioningRequest({
  promotionPlan,
  readinessReport,
  hostingContext: {
    provider: snapshot.provider,
    orderId: snapshot.orderRef,
    username: snapshot.accountRef,
    plan: snapshot.plan,
    inventoryCapturedAt: snapshot.capturedAt,
    websitesInspected: snapshot.websites?.length ?? 0,
    previewDnsRecordExists: snapshot.dns.previewRecordExists,
  },
  buildCommand: manifest.build,
  outputDirectory: manifest.output,
  applicationName: required(args, "application-name"),
  requestedAt: generatedAt,
});

const provisioningPacket = createPreviewProvisioningPacket({
  provisioningRequest,
  workflow: {
    name: required(args, "workflow-name"),
    runId: required(args, "run-id"),
    runAttempt: Number(required(args, "run-attempt")),
    repository: sourceRepository,
    ref: required(args, "ref"),
  },
  generatedAt,
});

await fs.mkdir(outputDirectory, { recursive: true });
await Promise.all([
  writeJson(path.join(outputDirectory, "promotion-plan.json"), promotionPlan),
  writeJson(path.join(outputDirectory, "readiness-report.json"), readinessReport),
  writeJson(path.join(outputDirectory, "provisioning-request.json"), provisioningRequest),
  writeJson(path.join(outputDirectory, "provisioning-packet.json"), provisioningPacket),
]);

process.stdout.write(
  `${JSON.stringify({
    artifactName,
    sourceSha,
    targetDomain: provisioningPacket.target.domain,
    executable: provisioningPacket.executable,
    approvalRequired: provisioningPacket.approvalRequired,
    fingerprint: provisioningPacket.fingerprint,
    approvalToken: provisioningPacket.approvalToken,
  })}\n`,
);
