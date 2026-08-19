#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const DOMAIN = "unico-preview.apidevelopers.digital";
const TOOL = "hostinger_deployStaticWebsite";
const archive = process.argv[2];
if (!archive || !fs.existsSync(archive) || !fs.statSync(archive).isFile()) throw new Error("carrier_archive_missing");
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
const client = new Client({ name: "apidevelopers-unico-preview-carrier", version: "1.0.0" }, { capabilities: {} });
try {
  await client.connect(transport);
  const listed = await client.listTools();
  const tool = listed.tools.find((item) => item.name === TOOL);
  if (!tool) throw new Error("hostinger_static_deploy_tool_missing");
  const result = await client.callTool({
    name: TOOL,
    arguments: { domain: DOMAIN, archivePath: path.resolve(archive), removeArchive: false },
  });
  if (result?.isError) throw new Error("hostinger_static_carrier_deploy_failed");
  console.log(JSON.stringify({ ok: true, domain: DOMAIN, tool: TOOL, archive: path.basename(archive) }));
} finally {
  try { await client.close(); } catch {}
}
