from __future__ import annotations

from fastapi import FastAPI
from pydantic import BaseModel, Field

from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool

app = FastAPI(title="MCP Brain v1", version="1.0.0")


class McpCall(BaseModel):
    tool: str = Field(..., min_length=1)
    arguments: dict = Field(default_factory=dict)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "mcp-brain-v1"}


@app.get("/mcp/tools")
def list_tools() -> dict:
    return {"ok": True, "tools": IMUNI_TOOL_DEFINITIONS, "count": len(IMUNI_TOOL_DEFINITIONS)}


@app.post("/mcp/call")
def mcp_call(payload: McpCall) -> dict:
    return call_imuni_tool(payload.tool, payload.arguments)
