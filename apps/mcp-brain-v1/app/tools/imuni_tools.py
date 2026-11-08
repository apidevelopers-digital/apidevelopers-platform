from __future__ import annotations

from typing import Any

from .imuni_base_tools import BASE_TOOL_DEFINITIONS, call_base_tool, is_base_tool
from .imuni_db_tools import DB_TOOL_DEFINITIONS, call_db_tool, is_db_tool
from .imuni_patient_sql_tools import call_patient_sql_tool
from .imuni_patient_tools import PATIENT_TOOL_DEFINITIONS, is_patient_tool
from .imuni_practitioner_tools import (
    PRACTITIONER_TOOL_DEFINITIONS,
    call_practitioner_tool,
    is_practitioner_tool,
)

IMUNI_TOOL_DEFINITIONS = (
    BASE_TOOL_DEFINITIONS
    + [tool for tool in DB_TOOL_DEFINITIONS if tool["name"] not in {item["name"] for item in BASE_TOOL_DEFINITIONS}]
    + [
        tool
        for tool in PRACTITIONER_TOOL_DEFINITIONS
        if tool["name"]
        not in {item["name"] for item in BASE_TOOL_DEFINITIONS}
        and tool["name"] not in {item["name"] for item in DB_TOOL_DEFINITIONS}
    ]
    + [
        tool
        for tool in PATIENT_TOOL_DEFINITIONS
        if tool["name"]
        not in {item["name"] for item in BASE_TOOL_DEFINITIONS}
        and tool["name"] not in {item["name"] for item in DB_TOOL_DEFINITIONS}
        and tool["name"] not in {item["name"] for item in PRACTITIONER_TOOL_DEFINITIONS}
    ]
)


def call_imuni_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if is_patient_tool(tool):
        return call_patient_sql_tool(tool, args)
    if is_practitioner_tool(tool):
        return call_practitioner_tool(tool, args)
    if is_db_tool(tool):
        return call_db_tool(tool, args)
    if is_base_tool(tool):
        return call_base_tool(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni tool", "would_execute": False}}
