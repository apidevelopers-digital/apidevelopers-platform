import { ADA_MCP_TOOLS } from "../mcp/tools.mjs";

export function buildOpenAiActionToolList() {
  return ADA_MCP_TOOLS.map((tool) => ({
    name: tool.name.replaceAll(".", "_"),
    description: tool.description,
    "x-ada-namespace": tool.ns,
    "x-ada-risk": tool.risk,
    "x-ada-approval": tool.approval,
    "x-ada-backend": tool.backend
  }));
}

export function buildActionCompatibilityReport() {
  return {
    ok: true,
    mode: "compatibility_manifest_only",
    total: ADA_MCP_TOOLS.length,
    tools: buildOpenAiActionToolList()
  };
}
