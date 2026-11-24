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


def _lite_tool(tool: dict) -> dict:
    return {
        "name": tool.get("name"),
        "description": tool.get("description"),
    }


@app.get("/mcp/tools")
def list_tools(
    full: bool = Query(default=False),
    start: int = Query(default=0, ge=0),
    count: int = Query(default=20, ge=1, le=50),
) -> dict:
    """Return a small default catalog for ChatGPT connector compatibility.

    The full schema remains available via /mcp/tools?full=true for internal
    diagnostics, but the default response is intentionally tiny to avoid
    ResponseTooLargeError when the public tool catalog grows.
    """
    tools = IMUNI_TOOL_DEFINITIONS

    if full:
        return {"ok": True, "tools": tools, "count": len(tools)}

    page = tools[start : start + count]
    return {
        "ok": True,
        "tools": [_lite_tool(tool) for tool in page],
        "count": len(tools),
        "start": start,
        "returned": len(page),
        "truncated": start + len(page) < len(tools),
        "lite": True,
        "full_schema_available_with": "/mcp/tools?full=true",
    }


@app.post("/mcp/call")
def mcp_call(payload: McpCall) -> dict:
    return call_imuni_tool(payload.tool, payload.arguments)
