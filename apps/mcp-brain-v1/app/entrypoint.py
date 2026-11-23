from __future__ import annotations

from fastapi import FastAPI, Query
from pydantic import BaseModel, Field

from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool

app = FastAPI(title="MCP Brain v1", version="1.0.0")


class McpCall(BaseModel):
    tool: str = Field(..., min_length=1)
    arguments: dict = Field(default_factory=dict)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "mcp-brain-v1"}


def _tool_summary(tool: dict) -> dict:
    return {
        "name": tool.get("name"),
        "description": tool.get("description"),
        "risk": tool.get("risk"),
        "title": tool.get("title"),
    }


@app.get("/mcp/tools")
def list_tools(
    summary: bool = Query(default=False),
    start: int = Query(default=0, ge=0),
    count: int = Query(default=200, ge=1, le=500),
) -> dict:
    tools = IMUNI_TOOL_DEFINITIONS

    if summary:
        page = tools[start : start + count]
        return {
            "ok": True,
            "tools": [_tool_summary(tool) for tool in page],
            "count": len(tools),
            "start": start,
            "returned": len(page),
            "truncated": start + len(page) < len(tools),
        }

    return {"ok": True, "tools": tools, "count": len(tools)}


@app.post("/mcp/call")
def mcp_call(payload: McpCall) -> dict:
    return call_imuni_tool(payload.tool, payload.arguments)
