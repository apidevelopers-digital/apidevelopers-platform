#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DOMAIN = "unico-preview.apidevelopers.digital";
const TOOL = "hostinger_deployJsApplication";
const archive = process.argv[2];
const output = process.env.GITHUB_OUTPUT || "";
function setStage(stage, ok=false) {
  if (output) fs.appendFileSync(output, `stage=${stage}\nok=${ok ? "true" : "false"}\n`);
  console.log(JSON.stringify({ ok, domain: DOMAIN, tool: TOOL, stage }));
}
function classify(text) {
  const s = String(text || "").toLowerCase();
  if (s.includes("resolve username") || s.includes("no website found") || s.includes("username not found")) return "resolve-domain";
  if (s.includes("fetch upload credentials") || s.includes("upload-urls") || s.includes("invalid upload credentials")) return "upload-credentials";
  if (s.includes("pre-upload") || s.includes("tus") || s.includes("failed to upload archive") || s.includes("upload failed")) return "tus-upload";
  if (s.includes("fetch build settings") || s.includes("resolve settings") || s.includes("settings/from-archive")) return "build-settings";
  if (s.includes("trigger build") || s.includes("failed to trigger build") || s.includes("build")) return "node-build";
  return "unknown";
}
if (!archive || !fs.existsSync(archive) || !fs.statSync(archive).isFile()) {
  setStage("local-archive", false);
  process.exit(0);
}
const token = process.env.HOSTINGER_API_TOKEN || "";
const bin = process.env.HOSTINGER_MCP_BIN || "";
if (!token || !bin || !fs.existsSync(bin)) {
  setStage("local-mcp", false);
  process.exit(0);
}
const transport = new StdioClientTransport({
  command: bin,
  args: [],
  env: { ...process.env, DEBUG: "false", APITOKEN: token },
  stderr: "pipe",
});
const client = new Client({ name: "apidevelopers-unico-preview-node", version: "1.0.0" }, { capabilities: {} });
try {
  await client.connect(transport);
  const listed = await client.listTools();
  if (!listed.tools.some((item) => item.name === TOOL)) {
    setStage("tool-missing", false);
    process.exit(0);
  }
  try {
    const result = await client.callTool({
      name: TOOL,
      arguments: { domain: DOMAIN, archivePath: path.resolve(archive), removeArchive: false },
    });
    const text = result?.content?.find?.((item) => item?.type === "text")?.text || "";
    if (result?.isError) {
      setStage(classify(text), false);
      process.exit(0);
    }
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    if (parsed?.resolveSettings?.status === "error") {
      setStage("build-settings", false);
      process.exit(0);
    }
    if (parsed?.build?.status === "error") {
      setStage("node-build", false);
      process.exit(0);
    }
    if (parsed?.upload?.status && parsed.upload.status !== "success") {
      setStage("tus-upload", false);
      process.exit(0);
    }
    setStage("completed", true);
  } catch (error) {
    setStage(classify(error?.message), false);
  }
} finally {
  try { await client.close(); } catch {}
}
