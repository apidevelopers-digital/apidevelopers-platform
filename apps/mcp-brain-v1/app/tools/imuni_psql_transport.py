from __future__ import annotations

import http.client
import json
import socket
import urllib.parse
from typing import Any


DOCKER_SOCKET_PATH = "/var/run/docker.sock"
IMUNI_POSTGRES_CONTAINER = "imuni-postgres"
IMUNI_DB_NAME = "imuni_clinical"
IMUNI_DB_USER = "imuni_app"


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str = DOCKER_SOCKET_PATH):
        super().__init__("localhost")
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.unix_socket_path)


def decode_docker_raw_stream(raw: str) -> str:
    """Demultiplex Docker exec raw stream output.

    Docker API exec/start for non-TTY attached output may return
    multiplexed frames formatted as:

    - 1 byte stream type: 1=stdout, 2=stderr
    - 3 null bytes
    - 4 byte big-endian payload length
    - payload

    When output is not multiplexed, return it as UTF-8 text.
    """
    data = raw.encode("latin1", errors="ignore")
    if len(data) < 8:
        return raw

    idx = 0
    out = bytearray()
    while idx + 8 <= len(data):
        stream_type = data[idx]
        if stream_type not in (1, 2) or data[idx + 1 : idx + 4] != b"\x00\x00\x00":
            return raw
        size = int.from_bytes(data[idx + 4 : idx + 8], "big")
        idx += 8
        if size < 0 or idx + size > len(data):
            return raw
        out.extend(data[idx : idx + size])
        idx += size

    if idx != len(data):
        return raw
    return out.decode("utf-8", errors="replace")


def docker_api(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 25) -> dict[str, Any]:
    conn = UnixHTTPConnection()
    conn.timeout = timeout
    payload = None
    headers: dict[str, str] = {}
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    try:
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read().decode("utf-8", errors="replace")
        parsed: Any = raw
        if raw.strip():
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
        return {"ok": 200 <= resp.status < 300, "status": resp.status, "body": parsed, "raw": raw[:8000]}
    except Exception as exc:
        return {"ok": False, "status": 0, "body": None, "raw": f"{exc.__class__.__name__}: {exc}"}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def docker_exec(container: str, cmd: list[str], timeout: int = 25) -> dict[str, Any]:
    create = docker_api("POST", f"/containers/{urllib.parse.quote(container, safe='')}/exec", {
        "AttachStdout": True,
        "AttachStderr": True,
        "Tty": False,
        "Cmd": cmd,
    }, timeout=timeout)
    if not create.get("ok") or not isinstance(create.get("body"), dict) or not create["body"].get("Id"):
        return {"ok": False, "stdout": "", "stder_tail": str(create.get("raw") or create.get("body"))[-1000:], "exit_code": None}

    exec_id = create["body"]["Id"]
    start = docker_api("POST", f"/exec/{urllib.parse.quote(exec_id, safe='')}/start", {"Detach": False, "Tty": False}, timeout=timeout)
    inspect = docker_api("GET", f"/exec/{urllib.parse.quote(exec_id, safe='')}/json", timeout=timeout)
    exit_code = None
    if isinstance(inspect.get("body"), dict):
        exit_code = inspect["body"].get("ExitCode")

    raw_stdout = start.get("raw") or ""
    stdout = decode_docker_raw_stream(raw_stdout).strip()
    return {"ok": bool(start.get("ok") and exit_code == 0), "stdout": stdout, "stderr_tail": "" if exit_code == 0 else stdout[-2000:], "exit_code": exit_code}


def psql_imuni(sql: str, variables: dict[str, str] | None = None, timeout: int = 25) -> dict[str, Any]:
    cmd = ["psql", "-U", IMUNI_DB_USER, "-d", IMUNI_DB_NAME, "-v", "ON_ERROR_STOP=1", "-At"]
    for key, value in (variables or {}).items():
        cmd.extend(["-v", f"{key}={value}"])
    cmd.extend(["-c", sql])
    return docker_exec(IMUNI_POSTGRES_CONTAINER, cmd, timeout=timeout)


def kv_lines_to_dict(stdout: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (stdout or "").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip()
    return out
