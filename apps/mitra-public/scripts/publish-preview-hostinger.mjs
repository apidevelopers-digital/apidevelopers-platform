#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const TOOL_NAME = "hostinger_deployStaticWebsite";
const EXPECTED_DOMAIN = "mitra-preview.apidevelopers.digital";
const APPROVAL_PHRASE = "IGOR_APROVA_MITRA_PREVIEW_DEPLOY";
const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;
const SECRET_KEY_PATTERN = /authorization|token|secret|password|cookie|jwt|private[_-]?key|auth[_-]?(?:key|rest)/i;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];
    if (!current.startsWith("--")) throw new Error(`unexpected_argument:${current}`);
    const key = current.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) out[key] = true;
    else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function required(name, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_or_invalid:${name}`);
  return value.trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitize(value, token) {
  if (value == null) return value;
  if (typeof value === "string") {
    let cleaned = value;
    if (token) cleaned = cleaned.split(token).join("[REDACTED_TOKEN]");
    return cleaned.length > 20000 ? `${cleaned.slice(0, 20000)}...[TRUNCATED]` : cleaned;
  }
  if (Array.isArray(value)) return value.map((item) => sanitize(item, token));
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[REDACTED]" : sanitize(item, token),
    ]));
  }
  return value;
}

async function writeEvidence(file, evidence, token) {
  const target = path.resolve(required("evidence", file));
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(sanitize(evidence, token), null, 2)}\n`, { mode: 0o600 });
}

function inspectArchive(archivePath) {
  const resolved = path.resolve(required("archive", archivePath));
  const stat = fsSync.statSync(resolved);
  if (!stat.isFile()) throw new Error("archive_not_file");
  if (stat.size <= 0) throw new Error("archive_empty");
  if (stat.size > MAX_ARCHIVE_BYTES) throw new Error(`archive_too_large:${stat.size}`);
  if (!resolved.toLowerCase().endsWith(".zip")) throw new Error("archive_must_be_zip");

  const entries = execFileSync("unzip", ["-Z1", resolved], {
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  }).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);

  if (!entries.includes("index.html")) throw new Error("archive_missing_root_index_html");
  if (entries.some((entry) => entry.startsWith("../") || entry.includes("/../"))) {
    throw new Error("archive_contains_path_traversal");
  }

  const bytes = fsSync.readFileSync(resolved);
  return {
    path: resolved,
    name: path.basename(resolved),
    bytes: stat.size,
    sha256: sha256(bytes),
    entryCount: entries.length,
    hasRootIndexHtml: true,
    sampleEntries: entries.slice(0, 40),
  };
}

function mcpExecutable() {
  const override = process.env.HOSTINGER_MCP_BIN;
  if (override) return path.resolve(override);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const executable = process.platform === "win32" ? "hostinger-hosting-mcp.cmd" : "hostinger-hosting-mcp";
  return path.join(here, "node_modules", ".bin", executable);
}

async function probePublicSite(domain, expectedText, attempts = 24, delayMs = 5000) {
  const url = `https://${domain}/`;
  let last = null;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: { accept: "text/html,application/xhtml+xml", "user-agent": "apidevelopers-platform/mitra-preview-probe" },
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const body = await response.text();
      const matched = !expectedText || body.toLowerCase().includes(expectedText.toLowerCase());
      last = {
        attempt,
        ok: response.ok && matched,
        httpOk: response.ok,
        expectedTextMatched: matched,
        status: response.status,
        finalUrl: response.url,
        contentType: response.headers.get("content-type"),
        bodyBytes: Buffer.byteLength(body),
        bodySha256: sha256(body),
      };
      if (last.ok) return last;
    } catch (error) {
      last = { attempt, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  return last;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? "preflight";
  const domain = required("domain", args.domain);
  const archive = inspectArchive(args.archive);
  const evidencePath = args.evidence ?? "mitra-preview-static-deploy-evidence.json";
  const expectedText = args["expected-text"] ?? "Mitra";
  const token = process.env.HOSTINGER_API_TOKEN ?? "";

  if (!["preflight", "apply"].includes(mode)) throw new Error(`unsupported_mode:${mode}`);
  if (domain !== EXPECTED_DOMAIN) throw new Error(`unexpected_preview_domain:${domain}`);

  let evidence = {
    schemaVersion: "1.0",
    kind: "mitra-public-dedicated-preview-static-deployment",
    generatedAt: new Date().toISOString(),
    mode,
    source: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      ref: process.env.GITHUB_REF_NAME ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    },
    target: {
      domain,
      preview: true,
      productionTouched: false,
      nodeRuntimeTouched: false,
      dnsChanged: false,
      milenaMitraTouched: false,
    },
    archive: {
      name: archive.name,
      bytes: archive.bytes,
      sha256: archive.sha256,
      entryCount: archive.entryCount,
      hasRootIndexHtml: archive.hasRootIndexHtml,
      sampleEntries: archive.sampleEntries,
      contentIncludedInEvidence: false,
    },
    security: {
      tokenPresent: Boolean(token),
      tokenValueIncludedInEvidence: false,
      writeExecuted: false,
    },
  };

  let client;
  try {
    if (mode === "apply") {
      const approvedSha = required("approved-sha", args["approved-sha"]);
      const approval = required("approval", args.approval);
      const currentSha = required("GITHUB_SHA", process.env.GITHUB_SHA);
      required("HOSTINGER_API_TOKEN", token);
      if (approvedSha !== currentSha) throw new Error(`approved_sha_mismatch:approved=${approvedSha}:current=${currentSha}`);
      if (approval !== APPROVAL_PHRASE) throw new Error("invalid_preview_approval_phrase");
      evidence.approval = { approvedSha, currentSha, phraseMatched: true };
    }

    const command = mcpExecutable();
    if (!fsSync.existsSync(command)) throw new Error(`hostinger_mcp_binary_not_found:${command}`);

    if (mode === "preflight") {
      evidence.mcp = {
        package: "hostinger-api-mcp",
        pinnedVersion: "1.26.0",
        scopedServer: "hostinger-hosting-mcp",
        binaryPresent: true,
        requiredTool: TOOL_NAME,
        liveToolCheckDeferredToApply: true,
      };
      evidence.status = "ready_for_explicit_preview_apply";
      await writeEvidence(evidencePath, evidence, token);
      console.log(JSON.stringify({ status: evidence.status, tool: TOOL_NAME, archiveSha256: archive.sha256, evidencePath }));
      return;
    }

    const transport = new StdioClientTransport({
      command,
      args: [],
      env: { ...process.env, DEBUG: "false", APITOKEN: token || "preflight-nonsecret-placeholder" },
      stderr: "pipe",
    });
    client = new Client({ name: "apidevelopers-platform-mitra-preview", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);

    const listed = await client.listTools();
    const tool = listed.tools.find((item) => item.name === TOOL_NAME);
    evidence.mcp = {
      package: "hostinger-api-mcp",
      pinnedVersion: "1.26.0",
      scopedServer: "hostinger-hosting-mcp",
      listedToolCount: listed.tools.length,
      requiredToolFound: Boolean(tool),
      requiredTool: tool ? { name: tool.name, description: tool.description ?? null, inputSchema: sanitize(tool.inputSchema ?? null, "") } : null,
    };
    if (!tool) throw new Error(`required_tool_missing:${TOOL_NAME}`);

    const result = await client.callTool({
      name: TOOL_NAME,
      arguments: { domain, archivePath: archive.path, removeArchive: false },
    });

    evidence.security.writeExecuted = true;
    evidence.deploy = { isError: Boolean(result?.isError), response: sanitize(result, token) };
    if (result?.isError) throw new Error("hostinger_static_deploy_tool_returned_error");

    const publicProbe = await probePublicSite(domain, expectedText);
    evidence.publicProbe = publicProbe;
    if (!publicProbe?.ok) throw new Error("preview_public_https_probe_failed");

    evidence.status = "completed_and_public";
    await writeEvidence(evidencePath, evidence, token);
    console.log(JSON.stringify({
      status: evidence.status,
      domain,
      archiveSha256: archive.sha256,
      publicStatus: publicProbe.status,
      evidencePath,
    }));
  } catch (error) {
    evidence = {
      ...evidence,
      status: "error",
      error: { message: error instanceof Error ? error.message : String(error) },
    };
    await writeEvidence(evidencePath, evidence, token);
    console.error(JSON.stringify({ status: "error", message: evidence.error.message, evidencePath }));
    process.exitCode = 1;
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
}

await main();
