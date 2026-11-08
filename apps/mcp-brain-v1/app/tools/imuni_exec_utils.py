from __future__ import annotations

from typing import Any


def docker_exec_text(payload: Any) -> str:
    """Normalize Docker exec output captured by the MCP docker helper.

    The helper may return text directly, or a dict with stdout/raw/body fields.
    This function intentionally returns printable text only so callers do not
    accidentally parse Docker multiplex framing bytes as application rows.
    """
    if isinstance(payload, dict):
        for key in ("stdout", "raw", "body"):
            value = payload.get(key)
            if isinstance(value, str) and value:
                payload = value
                break
        else:
            payload = ""
    text = str(payload or "")
    return "".join(ch for ch in text if ch == "\n" or ch == "\t" or ch.isprintable())


def parse_key_value_rows(stdout: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for raw in docker_exec_text(stdout).split("\n---ROW---\n"):
        item: dict[str, str] = {}
        for line in raw.splitlines():
            line = line.strip()
            if "=" in line:
                key, value = line.split("=", 1)
                item[key.strip()] = value
        if item:
            rows.append(item)
    return rows
