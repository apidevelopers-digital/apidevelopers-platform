#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const USERNAME = process.env.TARGET_HOSTINGER_USERNAME || "u242521810";
const DOMAIN = "apidevelopers.digital";
const here = path.dirname(fileURLToPath(import.meta.url));
const bin = process.env.HOSTINGER_MCP_BIN || path.join(
  here, "node_modules", ".bin",
  process.platform === "win32" ? "hostinger-hosting-mcp.cmd" : "hostinger-hosting-mcp"
);

function safe(mss) {
  return String(msg ?? "unknown").replace(/[\r\n]+/g, " ").slice(0, 500);
}

function annotate(title, message, level = "notice") {
  console.log(`::${level} title=${title}::${safe(message)}`);
}

if (!process.env.HOSTINGER_API_TOKEN) throw new Error("hostinger_token_missing");
if (!fs.existsSync(bin)) throw new Error(`mcp_binary_missing:${bin}`);

let client;
try {
  client = new Client({ name: "mitra-preview-upload-diagnostic", version: "1.0.0" }, { capabilities: {} });
  await client.connect(new StdioClientTransport({
    command: bin,
    args: [],
    env: { ...process.env, APITOKEN: process.env.HOSTINGER_API_TOKEN, DEBUG: "false" },
    stderr: "pipe",
  }));

  const listed = await client.listTools();
  const matches = listed.tools
    .filter((t) => /generateUploadURL/i.test(t.name))
    .map((t) => ({ name: t.name, required: t.inputSchema?.required || [], properties: Object.keys(t.inputSchema?.properties || {}) }));
  annotate("Mitra Hostinger tools", JSON.stringify(matches));

  const tool = listed.tools.find((t) => t.name === "hosting_generateUploadURLV1")
    || listed.tools.find((t) => /generateUploadURL/i.test(t.name) && t.name.startsWith("hosting_"));
  if (!tool) throw new Error("hosting_generateUploadURLV1_not_found");

  const args = {};
  const props = tool.inputSchema?.properties || {};
  if ("username" in props) args.username = USERNAME;
  if ("domain" in props) args.domain = DOMAIN;
  const missing = (tool.inputSchema?.required || []).filter((name) => !(name in args));
  if (missing.length) throw new Error(`required_args_unmapped:${missing.join(",")}`);
  annotate("Mitra Hostinger call", `tool=${tool.name};args=${Object.keys(args).join(",")}`);

  const result = await client.callTool({ name: tool.name, arguments: args });
  const textParts = (result?.content || []).filter((x) => x?.type === "text").map((x) => x.text);
  const structuredKeys = result?.structuredContent && typeof result.structuredContent === "object"
    ? Object.keys(result.structuredContent)
    : [];
  const summary = {isError: Boolean(result?.isError), contentCount: Array.isArray(result?.content) ? result.content.length : 0, hasText: textParts.length > 0, hasStructured: Boolean(result?.structuredContent), structuredKeys };
  annotate("Mitra Hostinger result", JSON.stringify(summary), result?.isError ? "error" : "notice");
  console.log(JSON.stringify({ ok: !result?.isError, tool: tool.name, summary }));
  if (result?.isError) process.exitCode = 2;
} catch (error) {
  annotate("Mitra Hostinger diagnostic", error instanceof Error ? error.message : String(error), "error");
  process.exitCode = 1;
} finally {
  if (client) {
    try { await client.close(); } catch {}
  }
}
