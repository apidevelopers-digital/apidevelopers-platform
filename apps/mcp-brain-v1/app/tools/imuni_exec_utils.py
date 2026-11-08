
from __future__ import annotations

import http.client
import json
import socket
import urllib.parse
from typing import Any

DOCKER_SOCKET_PATH = "/var/run/docker.sock"


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str, timeout: int = 30):
        super().__init__("localhost", timeout=timeout)
        self.unix_socket_path = unix_socket_path
        self.timeout = timeout

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
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

    Plain stdout is returned unchanged. Framed Docker output uses 8-byte headers:
    1 byte stream, 3 reserved zero bytes, 4-byte big-endian payload length.
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
    conn = _UnixHTTPConnection(DOCKER_SOCKET_PATH, timeout=timeout)
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


def _create_docker_exec(container: str, cmd: list[str], timeout: int = 30) -> tuple[bool, str]:
    response = _docker_api(
        "POST",
        f"/containers/{urllib.parse.quote(container, safe='')}/exec",
        {
            "AttachStdin": True,
            "AttachStdout": True,
            "AttachStderr": True,
            "Tty": False,
            "Cmd": cmd,
        },
        timeout=timeout,
    )
    if not response.get("ok") or not isinstance(response.get("body"), dict) or not response["body"].get("Id"):
        return False, str(response.get("raw") or response.get("body"))[-1000:]
    return True, response["body"]["Id"]


def _read_http_headers(sock: socket.socket) -> tuple[bytes, bytes]:
    data = b""
    while b"\r\n\r\n" not in data:
        chunk = sock.recv(1)
        if not chunk:
            break
        data += chunk
    if b"\r\n\r\n" in data:
        return data.split(b"\r\n\r\n", 1)
    return data, b""


def _http_hijack_exec_start(exec_id: str, stdin: bytes, timeout: int = 30) -> bytes:
    """Start a Docker exec and send stdin over the hijacked raw stream."""
    request_body = json.dumps({"Detach": False, "Tty": False}).encode("utf-8")
    request = (
        f"POST /exec/{exec_id}/start HTTP/1.1\r\n"
        f"Host: docker\r\n"
        f"Content-Type: application/json\r\n"
        f"Content-Length: {len(request_body)}\r\n"
        f"Connection: Upgrade\r\n"
        f"Upgrade: tcp\r\n"
        f"\r\n"
    ).encode("utf-8") + request_body

    sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
    sock.settimeout(timeout)
    try:
        sock.connect(DOCKER_SOCKET_PATH)
        sock.sendall(request)
        header, first_body = _read_http_headers(sock)
        status_line = header.split(b"\r\n", 1)[0]
        if b" 200 " not in status_line and b" 101 " not in status_line:
            return first_body + sock.makefile("bb").read()

        if stdin:
            sock.sendall(stdin)
            if not stdin.endswith(b"\n"):
                sock.sendall(b"\n")
        try:
            sock.shutdown(socket.SHUT_WR)
        except Exception:
            pass
        return first_body + sock.makefile("bb").read()
    finally:
        try:
            sock.close()
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
    """Run psql with SQL sent through Docker exec stdin, never argv."""
    if not sql or not sql.strip():
        return {"ok": False, "stdout": "", "stderr_tail": "SQL stdin payload is required.", "exit_code": None}

    ok, exec_id_or_error = _create_docker_exec(
        container,
        ["psql", "-U", user, "-d", database, "-v", "ON_ERROR_STOP=1", "-At"],
        timeout=timeout,
    )
    if not ok:
        return {"ok": False, "stdout": "", "stderr_tail": exec_id_or_error, "exit_code": None}

    exec_id = exec_id_or_error
    try:
        raw = _http_hijack_exec_start(exec_id, sql.encode("utf-8"), timeout)
    except Exception as exc:
        return {"ok": False, "stdout": "", "stderr_tail": f"{exc.__class__.__name__}: {exc}", "exit_code": None}

    inspect = _docker_api("GET", f"/exec/{exec_id}/json", timeout=timeout)
    exit_code = None
    if isinstance(inspect.get("body"), dict):
        exit_code = inspect["body"].get("ExitCode")

    stdout = docker_exec_text(raw)
    return {
        "ok": exit_code == 0,
        "stdout": stdout,
        "stderr_tail": "" if exit_code == 0 else stdout[-1000:],
        "exit_code": exit_code,
    }
