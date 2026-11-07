from __future__ import annotations

from typing import Any

from .imuni_base_tools import BASE_TOOL_DEFINITIONS, call_base_tool, is_base_tool
from .imuni_db_tools import DB_TOOL_DEFINITIONS, call_db_tool, is_db_tool

IMUNI_TOOL_DEFINITIONS = BASE_TOOL_DEFINITIONS + [
    tool for tool in DB_TOOL_DEFINITIONS
    if tool["name"] not in {item["name"] for item in BASE_TOOL_DEFINITIONS}
]


def call_imuni_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if is_db_tool(tool):
        return call_db_tool(tool, args)
    if is_base_tool(tool):
        return call_base_tool(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni tool", "would_execute": False}}
