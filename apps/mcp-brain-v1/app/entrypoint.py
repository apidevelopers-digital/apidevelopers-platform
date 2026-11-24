from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool
from app.tools.juri_datajud_tools import (
    JURI_DATAJUD_TOOL_DEFINITIONS,
    call_juri_datajud_tool,
    is_juri_datajud_tool,
)

app = FastAPI(title="MCP Brain v1", version="1.1.0")


class McpCall(BaseModel):
    tool: str = Field(..., min_length=1)
    arguments: dict = Field(default_factory=dict)


MCP_TOOL_DEFINITIONS = IMUNI_TOOL_DEFINITIONS + JURI_DATAJUD_TOOL_DEFINITIONS


@app.get("/health")
def health() -> dict:
    return {
        "ok": True,
        "service": "mcp-brain-v1",
        "modules": {
            "imuni": len(IMUNI_TOOL_DEFINITIONS),
            "juri_datajud": len(JURI_DATAJUD_TOOL_DEFINITIONS),
        },
    }


@app.get("/mcp/tools")
def list_tools() -> dict:
    return {"ok": True, "tools": MCP_TOOL_DEFINITIONS, "count": len(MCP_TOOL_DEFINITIONS)}


@app.post("/mcp/call")
def mcp_call(payload: McpCall) -> dict:
    if is_juri_datajud_tool(payload.tool):
        return call_juri_datajud_tool(payload.tool, payload.arguments)
    return call_imuni_tool(payload.tool, payload.arguments)
