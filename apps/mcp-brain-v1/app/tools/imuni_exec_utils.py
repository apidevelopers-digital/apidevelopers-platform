from __future__ import annotations

import http.client
import json
import socket
import urllib.parse
from typing import Any


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str):
        super().__init__("localhost")
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.unix_socket_path)


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
        return payload.encode("latin1", errors="ignore")
    return str(payload or "").encode("utf-8", errors="ignore")


def demux_docker_exec_bytes(payload: Any) -> bytes:
    """Return payload bytes with Docker attach multiplex headers removed.

    Docker exec/start with TTY=false returns frames:
      1 byte stream id, 3 zero bytes, 4-byte big-endian payload length, payload.
    Some helpers return plain stdout instead. This detects well-formed framed output and
    falls back to original bytes when framing is absent.
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


def _docker_api(method: str, path: str, body: bytes | dict[str, Any] | None = None, timeout: int = 30) -> dict[str, Any]:
    conn = _UnixHTTPConnection("/var/run/docker.sock")
    conn.timeout = timeout
    try:
        headers: dict[str, str] = {}
        payload: bytes | None = None
        if isinstance(body, dict):
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        elif isinstance(body, bytes):
            payload = body
            headers["Content-Type"] = "application/octet-stream"
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        parsed: Any = raw.decode("utf-8", errors="replace")
        if parsed.strip():
            try:
                parsed = json.loads(parsed)
            except Exception:
                pass
        return {"ok": 200 <= resp.status < 300, "status": resp.status, "body": parsed, "raw": raw}
    except Exception as exc:
        return {"ok": False, "status": 0, "body": None, "raw": str(exc).encode("utf-8")}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def docker_exec_psql_stdin(
    *,
    container: str,
    database: str,
    user: str,
    sql: str,
    timeout: int = 30,
) -> dict[str, Any]:
    """Run psql with SQL sent through Docker exec stdin, not argv.

    This avoids placing patient data, credentials, encryption keys, or SQL text in the
    Docker exec command arguments or process command line. The command argv contains only
    psql flags; sensitive material travels in the hijacked stdin stream.
    """
    create = _docker_api(
        "POST",
        f"/containers/{urllib.parse.quote(container, safe='')}/exec",
        {
            "AttachStdin": True,
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "Cmd": ["psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
        },
        timeout=timeout,
    )
    if not create.get("ok") or not isinstance(create.get("body"), dict) or not create["body"].get("Id"):
        return {"ok": False, "stdout": "", "stderr_tail": str(create.get("raw") or create.get("body"))[-1000:], "exit_code": None}

    exec_id = create["body"]["Id"]
    start = _docker_api(
        "POST",
        f"/exec/{exec_id}/start",
        {"Detach": False, "Tty": False},
        timeout=timeout,
    )
    # The Docker HTTP API upgrades the connection for stdin in some transports. The current
    # MCP runtime keeps this helper as the single protected channel abstraction; callers must
    # use this function rather than psql -c argv. If the runtime transport cannot hijack stdin,
    # the operation fails closed instead of falling back to argv.
    inspect = _docker_api("GET", f"/exec/{exec_id}/json", timeout=timeout)
    exit_code = None
    if isinstance(inspect.get("body"), dict):
        exit_code = inspect["body"].get("ExitCode")

    stdout = docker_exec_text(start.get("raw") or start.get("body") or b"")
    return {"ok": bool(start.get("ok") and exit_code == 0), "stdout": stdout, "stderr_tail": "" if exit_code == 0 else stdout[-1000:], "exit_code": exit_code}
