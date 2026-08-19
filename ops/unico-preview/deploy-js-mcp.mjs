#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DOMAIN = "unico-preview.apidevelopers.digital";
const TOOL = "hostinger_deployJsApplication";
const archive = process.argv[2];
if (!archive || !fs.existsSync(archive) || !fs.statSync(archive).isFile()) throw new Error("node_archive_missing");
const token = process.env.HOSTINGER_API_TOKEN || "";
if (!token) throw new Error("hostinger_token_missing");
const bin = process.env.HOSTINGER_MCP_BIN;
if (!bin || !fs.existsSync(bin)) throw new Error("hostinger_mcp_binary_missing");

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
  const tool = listed.tools.find((item) => item.name === TOOL);
  if (!tool) throw new Error("hostinger_deploy_js_tool_missing");
  const result = await client.callTool({
    name: TOOL,
    arguments: { domain: DOMAIN, archivePath: path.resolve(archive), removeArchive: false },
  });
  if (result?.isError) throw new Error("hostinger_deploy_js_application_failed");
  const text = result?.content?.find?.((item) => item?.type === "text")?.text;
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch {}
  const safe = {
    ok: true,
    domain: DOMAIN,
    tool: TOOL,
    uploadStatus: parsed?.upload?.status ?? null,
    resolveSettingsStatus: parsed?.resolveSettings?.status ?? null,
    buildStatus: parsed?.build?.status ?? null,
    buildId: parsed?.build?.data?.uuid ?? parsed?.build?.data?.id ?? null
  };
  console.log(JSON.stringify(safe));
} finally {
  try { await client.close(); } catch {}
}
