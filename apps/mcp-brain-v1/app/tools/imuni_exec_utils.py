from __future__ import annotations

from typing import Any


def _payload_from_dict(payload: dict[str, Any]) -> Any:
    for key in ("stdout", "raw", "body"):
        value = payload.get(key)
        if value not in (None, ""):
            return value
    return ""


def _as_bytes(payload: Any) -> bytes:
    if isinstance(payload, dict):
        payload = _payload_from_dict(payload)
    if isinstance(payload, bytes):
        return payload
    if isinstance(payload, bytearray):
        return bytes(payload)
    if isinstance(payload, str):
        # Preserve 1:1 byte values when callers pass a binary-ish string.
        return payload.encode("latin1", errors="ignore")
    return str(payload or "").encode("utf-8", errors="ignore")


def demux_docker_exec_bytes(payload: Any) -> bytes:
    """Return payload bytes with Docker attach multiplex headers removed.

    Docker exec/start with TTY=false returns frames:
      1 byte stream id, 3 zero bytes, 4-byte big-endian payload length, payload.
    Some helpers return plain stdout instead. This function detects well-formed
    framed output and falls back to the original bytes when framing is absent.
    """
    data = _as_bytes(payload)
    if len(data) < 8:
        return data

    chunks: list[bytes] = []
    pos = 0
    saw_frame = False

    while pos < len(data):
        if pos + 8 > len(data):
            return data
        stream_type = data[pos]
        reserved = data[pos + 1 : pos + 4]
        length = int.from_bytes(data[pos + 4 : pos + 8], "big")
        start = pos + 8
        end = start + length

        if stream_type not in (0, 1, 2) or reserved != b"\x00\x00\x00" or end > len(data):
            return data

        chunks.append(data[start:end])
        pos = end
        saw_frame = True

    return b"".join(chunks) if saw_frame else data


def docker_exec_text(payload: Any) -> str:
    """Normalize Docker exec output captured by the MCP Docker helper."""
    data = demux_docker_exec_bytes(payload)
    text = data.decode("utf-8", errors="replace")
    return "".join(ch for ch in text if ch == "\n" or ch == "\t" or ch.isprintable())


def parse_key_value_rows(stdout: Any) -> list[dict[str, str]]:
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
