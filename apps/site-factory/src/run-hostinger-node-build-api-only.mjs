#!/usr/bin/env node
import fs from "node:fs/promises";
import {
  createNodeBuildFromArchive,
  createSanitizedRequestPreview,
  inspectArchive,
  listNodeBuilds,
  probePublicSite,
  sanitizeEvidence,
  waitForNodeBuild,
} from "./hostinger-node-build-api-only.mjs";

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (!current.startsWith("--")) throw new Error(`unexpected_argument:${current}`);
    const key = current.slice(2);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      result[key] = true;
    } else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

async function writeEvidence(file, evidence) {
  const content = `${JSON.stringify(evidence, null, 2)}\n`;
  await fs.writeFile(required("evidence", file), content, { mode: 0o600 });
}

const args = parseArgs(process.argv.slice(2));
const generatedAt = new Date().toISOString();
const mode = args.mode ?? "preflight";
const username = args.username ?? process.env.HOSTINGER_USERNAME;
const domain = args.domain ?? process.env.HOSTINGER_DOMAIN;
const archivePath = args.archive;
const transport = args.transport ?? "multipart";
const evidencePath = args.evidence ?? "hostinger-node-build-evidence.json";
const token = process.env.HOSTINGER_API_TOKEN ?? "";
const common = {
  username: required("username", username),
  domain: required("domain", domain),
  archivePath: required("archive", archivePath),
  transport,
  nodeVersion: Number(args["node-version"] ?? 22),
  appType: args["app-type"] ?? "vite",
  rootDirectory: args["root-directory"],
  outputDirectory: args["output-directory"] ?? "dist",
  buildScript: args["build-script"] ?? "build",
  entryFile: args["entry-file"],
  packageManager: args["package-manager"] ?? "npm",
};

let evidence;
try {
  const archive = await inspectArchive(common.archivePath);
  const request = createSanitizedRequestPreview({
    ...common,
    archive,
  });

  evidence = {
    schemaVersion: "1.0",
    kind: "site-factory-hostinger-api-only-node-build",
    generatedAt,
    mode,
    apiOnly: true,
    panelFallbackAllowed: false,
    tokenPresent: Boolean(token),
    source: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
    target: {
      username: common.username,
      domain: common.domain,
    },
    request,
  };

  if (mode === "preflight") {
    evidence.status = "ready_for_explicit_apply";
    evidence.writeExecuted = false;
    await writeEvidence(evidencePath, evidence);
    console.log(JSON.stringify(evidence));
    process.exit(0);
  }

  if (mode !== "apply") throw new Error(`unsupported:mode:${mode}`);
  required("HOSTINGER_API_TOKEN", token);

  const before = await listNodeBuilds({
    token,
    username: common.username,
    domain: common.domain,
  });
  const created = await createNodeBuildFromArchive({
    token,
    ...common,
  });
  const terminal = await waitForNodeBuild({
    token,
    username: common.username,
    domain: common.domain,
    uuid: created.uuid,
  });
  const publicProbe =
    terminal.build?.state === "completed"
      ? await probePublicSite({
          domain: common.domain,
          expectedText: args["expected-text"] ?? "API Developers.digital",
        })
      : null;

  evidence = {
    ...evidence,
    status:
      terminal.build?.state === "completed" && publicProbe?.ok
        ? "completed_and_public"
        : terminal.build?.state == "failed"
          ? "build_failed"
          : terminal.terminal
            ? "terminal_without_public_success"
            : "poll_timeout",
    writeExecuted: true,
    before: {
      status: before.status,
      buildCount: before.builds.length,
    },
    created,
    terminal,
    publicProbe,
  };
  await writeEvidence(evidencePath, sanitizeEvidence(evidence, token));
  console.log(JSON.stringify(sanitizeEvidence(evidence, token)));

  if (evidence.status !== "completed_and_public") {
    process.exitCode = 1;
  }
} catch (error) {
  const failure = sanitizeEvidence(
    {
      ...(evidence ?? {
        schemaVersion: "1.0",
        kind: "site-factory-hostinger-api-only-node-build",
        generatedAt,
        mode,
        apiOnly: true,
        panelFallbackAllowed: false,
        target: {
          username: username ?? null,
          domain: domain ?? null,
        },
      }),
      status: "error",
      error: {
        message: error instanceof Error ? error.message : String(error),
        evidence: error?.evidence ??? null,
      },
    },
    token,
  );
  await writeEvidence(evidencePath, failure);
  console.error(JSON.stringify(failure));
  process.exitCode = 1;
}
