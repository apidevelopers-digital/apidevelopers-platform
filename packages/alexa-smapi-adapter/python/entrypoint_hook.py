"""Opt-in adapter for the *existing* MCP Brain entrypoint.py dispatch pattern.

Nothing registers automatically. An authenticated backend must inject a reader;
until then no Alexa tool appears in the catalog and every call fails closed.
"""
from .alexa_mcp_tools import TOOL_NAMES, tool_descriptions, call_alexa_tool

class AlexaNotConfigured(RuntimeError):
    pass

def register_alexa_descriptions(payload, *, reader=None):
    """Return a new catalog, without touching the caller's payload."""
    if reader is None:
        return payload
    if not callable(getattr(reader, "list_skills", None)) or not callable(getattr(reader, "get_manifest", None)):
        raise AlexaNotConfigured("alexa_reader_unavailable")
    if not isinstance(payload, dict) or not isinstance(payload.get("tools"), list):
        raise ValueError("invalid_mcp_catalog")
    result = {**payload, "tools": list(payload["tools"])}
    present = {t.get("name") for t in result["tools"] if isinstance(t, dict)}
    for definition in tool_descriptions():
        if definition["name"] not in present:
            result["tools"].append(definition)
    result["count"] = len(result["tools"])
    result["tool_count_including_policy_tools"] = len(result["tools"])
    return result

def dispatch_alexa(tool, args, *, reader=None):
    """Handle only Alexa R1 commands; caller authenticates MCP requests first."""
    if tool not in TOOL_NAMES:
        raise ValueError("alexa_tool_not_supported")
    if reader is None:
        raise AlexaNotConfigured("alexa_reader_unavailable")
    if not callable(getattr(reader, "list_skills", None)) or not callable(getattr(reader, "get_manifest", None)):
        raise AlexaNotConfigured("alexa_reader_unavailable")
    return call_alexa_tool(tool, args, reader)
