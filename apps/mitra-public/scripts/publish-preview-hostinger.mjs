#!/usr/bin/env node
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const APPROVAL_PHRASE = "IGOR_APROVA_MITRA_PREVIEW_DEPLOY";
const EXPECTED_DOMAIN = "preview-apidevelopers.apidevelopers.digital";
const EXPECTED_PREFIX = "mitra";
const MAX_TOTAL_BYTES = 100 * 1024 * 1024;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

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

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

async function listFiles(root) {
  const files = [];
  async function walk(current, rel = "") {
    const entries = await fs.readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const abs = path.join(current, entry.name);
      const nextRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) throw new Error(`symlink_not_allowed:${nextRel}`);
      if (entry.isDirectory()) await walk(abs, nextRel);
      else if (entry.isFile()) {
        const stat = await fs.stat(abs);
        if (stat.size > MAX_FILE_BYTES) throw new Error(`file_too_large:${nextRel}:${stat.size}`);
        files.push({ abs, rel: nextRel, bytes: stat.size });
      }
    }
  }
  await walk(root);
  if (!files.some((file) => file.rel === "index.html")) throw new Error("dist_missing_index_html");
  const total = files.reduce((sum, file) => sum + file.bytes, 0);
  if (total <= 0) throw new Error("dist_empty");
  if (total > MAX_TOTAL_BYTES) throw new Error(`dist_too_large:${total}`);
  return { files, total };
}

function sanitize(value) {
  if (value == null) return value;
  if (typeof value === "string") {
    if (value.length > 500) return `${value.slice(0, 500)}...[TRUNCATED]`;
    return value;
  }
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => {
      if (/auth|token|secret|password|cookie|jwt|key/i.test(key)) return [key, "[REDACTED]"];
      return [key, sanitize(item)];
    }));
  }
  return value;
}

function parseToolJson(result) {
  const texts = Array.isArray(result?.content)
    ? result.content.filter((item) => item?.type === "text").map((item) => item.text)
    : [];
  for (const text of texts) {
    if (typeof text !== "string") continue;
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object") return parsed;
    } catch {}
  }
  if (result && typeof result === "object") return result;
  throw new Error("upload_url_response_not_json");
}

function resolveUploadCredentials(payload) {
  const candidates = [
    payload,
    payload?.data,
    payload?.result,
    payload?.response,
    payload?.data?.data,
  ].filter(Boolean);
  for (const item of candidates) {
    if (typeof item?.url === "string" && typeof item?.auth_key === "string" && typeof item?.rest_auth_key === "string") {
      return { url: item.url, authKey: item.auth_key, restAuthKey: item.rest_auth_key };
    }
  }
  throw new Error("upload_credentials_missing");
}

function encodeRemotePath(remotePath) {
  return remotePath.split("/").map((segment) => encodeURIComponent(segment)).join("/");
}

async function tusUpload({ credentials, localPath, remotePath }) {
  const bytes = await fs.readFile(localPath);
  const target = `${credentials.url.replace(/\/+$/, "")}/${encodeRemotePath(remotePath)}?override=true`;
  const baseHeaders = {
    "X-Auth": credentials.authKey,
    "X-Auth-Rest": credentials.restAuthKey,
    "Tus-Resumable": "1.0.0",
  };

  const create = await fetch(target, {
    method: "POST",
    headers: {
      ...baseHeaders,
      "Upload-Length": String(bytes.length),
      "Upload-Offset": "0",
    },
  });
  if (create.status !== 201) {
    const body = await create.text().catch(() => "");
    throw new Error(`tus_create_failed:${remotePath}:${create.status}:${body.slice(0, 200)}`);
  }

  const patch = await fetch(target, {
    method: "PATCH",
    headers: {
      ...baseHeaders,
      "Content-Type": "application/offset+octet-stream",
      "Upload-Offset": "0",
    },
    body: bytes,
  });
  if (patch.status !== 204) {
    const body = await patch.text().catch(() => "");
    throw new Error(`tus_patch_failed:${remotePath}:${patch.status}:${body.slice(0, 200)}`);
  }
  const offset = patch.headers.get("upload-offset");
  if (offset && Number(offset) !== bytes.length) {
    throw new Error(`tus_offset_mismatch:${remotePath}:${offset}:${bytes.length}`);
  }
  return { remotePath, bytes: bytes.length, sha256: sha256(bytes) };
}

async function probePublic({ domain, prefix, expectedText }) {
  const url = `https://${domain}/${prefix}/?deploy_probe=${Date.now()}`;
  let last = null;
  for (let tempt = 1; tempt <= 18; tempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        cache: "no-store",
        headers: { "user-agent": "apidevelopers-platform/mitra-preview-publisher" },
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
        bodyBytes: Buffer.byteLength(body),
        bodySha256: sha256(body),
      };
      if (last.ok) return last;
    } catch (error) {
      last = { attempt, ok: false, error: error instanceof Error ? error.message : String(error) };
    }
    if (attempt < 18) await new Promise((resolve) => setTimeout(resolve, 5000));
  }
  return last;
}

async function writeEvidence(file, evidence) {
  const target = path.resolve(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(sanitize(evidence), null, 2)}\n`, { mode: 0o600 });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const mode = args.mode ?? "preflight";
  const domain = required("domain", args.domain);
  const prefix = required("prefix", args.prefix).replace(/^\/+|\/+$/g, "");
  const dist = path.resolve(required("dist", args.dist));
  const evidencePath = args.evidence ?? "mitra-preview-publish-evidence.json";
  const expectedText = args["expected-text"] ?? "Mitra";
  const approvedSha = args["approved-sha"] ?? "";
  const approval = args.approval ?? "";
  const token = process.env.HOSTINGER_API_TOKEN ?? "";

  if (!["preflight", "apply"].includes(mode)) throw new Error(`unsupported_mode:${mode}`);
  if (domain !== EXPECTED_DOMAIN) throw new Error(`unexpected_preview_domain:${domain}`);
  if (prefix !== EXPECTED_PREFIX) throw new Error(`unexpected_preview_prefix:${prefix}`);
  if (!fsSync.existsSync(dist) || !fsSync.statSync(dist).isDirectory()) throw new Error("dist_not_directory");

  const inventory = await listFiles(dist);
  const indexHtml = await fs.readFile(path.join(dist, "index.html"), "utf8");
  if (!indexHtml.toLowerCase().includes(expectedText.toLowerCase())) {
    throw new Error("dist_index_missing_expected_text");
  }
  if (!indexHtml.includes("/mitra/")) {
    throw new Error("dist_index_missing_mitra_base_path");
  }

  const evidence = {
    schemaVersion: "1.0",
    kind: "mitra-public-preview-targeted-publisher",
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
      prefix: `${prefix}/`,
      publicUrl: `https://${domain}/${prefix}/`,
      strategy: "targeted_file_overwrite_no_delete",
      websiteRootOverwriteAllowed: false,
      productionDomainTouched: false,
      nodeRuntimeTouched: false,
      dnsChanged: false,
    },
    build: {
      dist,
      fileCount: inventory.files.length,
      totalBytes: inventory.total,
      indexSha256: sha256(indexHtml),
      basePathVerified: true,
    },
    security: {
      tokenPresent: Boolean(token),
      tokenIncludedInEvidence: false,
      writeExecuted: false,
    },
    mcp: null,
    uploaded: [],
    publicProbe: null,
    status: "initialized",
  };

  let client;
  try {
    if (mode === "apply") {
      const currentSha = required("GITHUB_SHA", process.env.GITHUB_SHA);
      required("HOSTINGER_API_TOKEN", token);
      if (approvedSha !== currentSha) throw new Error(`approved_sha_mismatch:approved=${approvedSha}:current=${currentSha}`);
      if (approval !== APPROVAL_PHRASE) throw new Error("invalid_preview_approval_phrase");
    }

    const command = process.env.HOSTINGER_MCP_BIN
      ? path.resolve(process.env.HOSTINGER_MCP_BIN)
      : path.join(path.dirname(fileURLToPath(import.meta.url)), "node_modules", ".bin", process.platform === "win32" ? "hostinger-hosting-mcp.cmd" : "hostinger-hosting-mcp");
    if (!fsSync.existsSync(command)) throw new Error(`hostinger_mcp_binary_not_found:${command}`);

    const transport = new StdioClientTransport({
      command,
      args: [],
      env: {
        ...process.env,
        DEBUG: "false",
        APITOKEN: token || "preflight-nonsecret-placeholder",
      },
      stderr: "pipe",
    });
    client = new Client({ name: "apidevelopers-platform-mitra-preview", version: "1.0.0" }, { capabilities: {} });
    await client.connect(transport);
    const listed = await client.listTools();
    const tool = listed.tools.find((item) => item.name === "hosting_generateUploadURLV1")
      ?? listed.tools.find((item) => /generateUploadURL/i.test(item.name) && item.name.startsWith("hosting_"));
    evidence.mcp = {
      package: "hostinger-api-mcp",
      pinnedVersion: "1.26.0",
      scopedServer: "hostinger-hosting-mcp",
      toolCount: listed.tools.length,
      uploadToolFound: Boolean(tool),
      uploadToolName: tool?.name ?? null,
      uploadToolInputSchema: sanitize(tool?.inputSchema ?? null),
    };
    if (!tool) throw new Error("hosting_upload_url_tool_missing");

    if (mode === "preflight") {
      evidence.status = "ready_for_explicit_preview_apply";
      await writeEvidence(evidencePath, evidence);
      console.log(JSON.stringify({
        status: evidence.status,
        domain,
        prefix,
        fileCount: inventory.files.length,
        totalBytes: inventory.total,
        uploadTool: tool.name,
        evidencePath,
      }));
      return;
    }

    const properties = tool.inputSchema?.properties ?? {};
    const uploadArgs = {};
    if (Object.prototype.hasOwnProperty.call(properties, "domain")) uploadArgs.domain = domain;
    if (Object.prototype.hasOwnProperty.call(properties, "username")) uploadArgs.username = process.env.TARGET_HOSTINGER_USERNAME ?? "";
    if (Object.keys(uploadArgs).length === 0) throw new Error("unsupported_upload_tool_schema");

    const result = await client.callTool({ name: tool.name, arguments: uploadArgs });
    if (result?.isError) throw new Error("hostinger_generate_upload_url_returned_error");
    const credentials = resolveUploadCredentials(parseToolJson(result));

    const ordered = [...inventory.files].sort((a, b) => {
      if (a.rel === "index.html") return 1;
      if (b.rel === "index.html") return -1;
      return a.rel.localeCompare(b.rel);
    });

    for (const file of ordered) {
      const remotePath = `${prefix}/${file.rel}`.replace(/\/+/g, "/");
      if (!remotePath.startsWith(`${EXPECTED_PREFIX}/`)) throw new Error(`remote_path_escape:${remotePath}`);
      const uploaded = await tusUpload({ credentials, localPath: file.abs, remotePath });
      evidence.uploaded.push(uploaded);
    }

    evidence.security.writeExecuted = true;
    evidence.publicProbe = await probePublic({ domain, prefix, expectedText });
    if (!evidence.publicProbe?.ok) throw new Error("preview_public_probe_failed");
    evidence.status = "completed_and_public";
    await writeEvidence(evidencePath, evidence);
    console.log(JSON.stringify({
      status: evidence.status,
      publicUrl: evidence.target.publicUrl,
      uploadedFiles: evidence.uploaded.length,
      totalBytes: evidence.uploaded.reduce((sum, item) => sum + item.bytes, 0),
      publicStatus: evidence.publicProbe.status,
      evidencePath,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const failed = {
      ...evidence,
      status: "error",
      error: { message },
    };
    await writeEvidence(evidencePath, failed);
    console.error(JSON.stringify({ status: "error", message, evidencePath }));
    process.exitCode = 1;
  } finally {
    if (client) {
      try { await client.close(); } catch {}
    }
  }
}

await main();
