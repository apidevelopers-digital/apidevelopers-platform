#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DOMAIN = "unico-preview.apidevelopers.digital";
const TOOL = "hostinger_deployStaticWebsite";
const archive = process.argv[2];
const output = process.env.GITHUB_OUTPUT || "";

function setResult(stage, ok = false) {
  if (output) fs.appendFileSync(output, `stage=${stage}\nok=${ok ? "true" : "false"}\n`);
  console.log(JSON.stringify({ ok, domain: DOMAIN, tool: TOOL, stage }));
}
function classify(value) {
  const s = String(value || "").toLowerCase();
  if (s.includes("tool") && (s.includes("not found") || s.includes("missing"))) return "tool-missing";
  if (s.includes("domain") || s.includes("website") || s.includes("resolve username") || s.includes("username not found")) return "resolve-domain";
  if (s.includes("upload credential") || s.includes("upload-urls")) return "upload-credentials";
  if (s.includes("tus") || s.includes("upload archive") || s.includes("upload failed") || s.includes("pre-upload")) return "tus-upload";
  if (s.includes("deploy") || s.includes("static")) return "static-deploy";
  return "unknown";
}

if (!archive || !fs.existsSync(archive) || !fs.statSync(archive).isFile()) {
  setResult("local-archive", false);
  process.exit(0);
}
const token = process.env.HOSTINGER_API_TOKEN || "";
const bin = process.env.HOSTINGER_MCP_BIN || "";
if (!token || !bin || !fs.existsSync(bin)) {
  setResult("local-mcp", false);
  process.exit(0);
}

const transport = new StdioClientTransport({
  command: bin,
  args: [],
  env: { ...process.env, DEBUG: "false", APITOKEN: token },
  stderr: "pipe",
});
const client = new Client(
  { name: "apidevelopers-unico-preview-carrier", version: "1.0.0" },
  { capabilities: {} }
);

try {
  await client.connect(transport);
  const listed = await client.listTools();
  if (!listed.tools.some((item) => item.name === TOOL)) {
    setResult("tool-missing", false);
    process.exit(0);
  }
  try {
    const result = await client.callTool({
      name: TOOL,
      arguments: {
        domain: DOMAIN,
        archivePath: path.resolve(archive),
        removeArchive: false,
      },
    });
    const text = result?.content?.find?.((item) => item?.type === "text")?.text || "";
    if (result?.isError) {
      setResult(classify(text), false);
      process.exit(0);
    }
    setResult("completed", true);
  } catch (error) {
    setResult(classify(error?.message), false);
  }
} finally {
  try { await client.close(); } catch {}
}
