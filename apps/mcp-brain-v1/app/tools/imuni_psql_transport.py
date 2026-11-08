from __future__ import annotations

import http.client
import json
import socket
import urllib.parse
from typing import Any

DOCKER_SOCKET_PATH = "/var/run/docker.sock"
IMUNI_POSTGRES_CONTAINER = "imuni-postgres"


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str = DOCKER_SOCKET_PATH, timeout: int = 25):
        super().__init__("localhost", timeout=timeout)
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        if self.timeout is not None:
            sock.settimeout(self.timeout)
        sock.connect(self.unix_socket_path)
        self.sock = sock


def decode_docker_raw_stream(raw: bytes | str) -> str:
    """Demultiplex Docker exec raw stream output.

    Keep data as bytes until frame headers are removed. Decode payloads only
    after demultiplexing so UTF-8 byte counts remain valid for non-ASCII text.
    """
    data = raw.encode("latin1", errors="ignore") if isinstance(raw, str) else raw
    if len(data) < 8:
        return data.decode("utf-8", errors="replace")

    idx = 0
    out = bytearray()
    while idx + 8 <= len(data):
        stream_type = data[idx]
        if stream_type not in (1, 2) or data[idx + 1 : idx + 4] != b"\x00\x00\x00":
            return data.decode("utf-8", errors="replace")
        size = int.from_bytes(data[idx + 4 : idx + 8], "big")
        idx += 8
        if size < 0 or idx + size > len(data):
            return data.decode("utf-8", errors="replace")
        out.extend(data[idx : idx + size])
        idx += size

    if idx != len(data):
        return data.decode("utf-8", errors="replace")
    return out.decode("utf-8", errors="replace")


def docker_api_json(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 25) -> dict[str, Any]:
    conn = UnixHTTPConnection(timeout=timeout)
    payload = None
    headers: dict[str, str] = {}
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    try:
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw_bytes = resp.read()
        raw = raw_bytes.decode("utf-8", errors="replace")
        parsed: Any = raw
        if raw.strip():
            try:
                parsed = json.loads(raw)
            except Exception:
                parsed = raw
        return {"ok": 200 <= resp.status < 300, "status": resp.status, "body": parsed, "raw": raw}
    except Exception as exc:
        return {"ok": False, "status": 0, "body": None, "raw": f"{exc.__class__.__name__}: {exc}"}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def docker_api_raw(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 25) -> dict[str, Any]:
    conn = UnixHTTPConnection(timeout=timeout)
    payload = None
    headers: dict[str, str] = {}
    if body is not None:
        payload = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"

    try:
        conn.request(method, path, body=payload, headers=headers)
        resp = conn.getresponse()
        raw = resp.read()
        return {"ok": 200 <= resp.status < 300, "status": resp.status, "raw_bytes": raw}
    except Exception as exc:
        return {"ok": False, "status": 0, "raw_bytes": b"", "raw": f"{exc.__class__.__name__}: {exc}"}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def docker_exec(container: str, cmd: list[str], timeout: int = 25) -> dict[str, Any]:
    """Run a non-sensitive command in a container through Docker API.

    Patient SQL and patient values must not be passed in argv. Future SQL
    execution must use a reviewed stdin-based transport.
    """
    create = docker_api_json(
        "POST",
        f"/containers/{urllib.parse.quote(container, safe='')}/exec",
        {"AttachStdout": True, "AttachStderr": True, "Tty": False, "Cmd": cmd},
        timeout=timeout,
    )
    if not create.get("ok") or not isinstance(create.get("body"), dict) or not create["body"].get("Id"):
        return {
            "ok": False,
            "stdout": "",
            "stderr_tail": str(create.get("raw") or create.get("body"))[-1000:],
            "exit_code": None,
        }

    exec_id = create["body"]["Id"]
    start = docker_api_raw(
        "POST",
        f"/exec/{urllib.parse.quote(exec_id, safe='')}/start",
        {"Detach": False, "Tty": False},
        timeout=timeout,
    )
    inspect = docker_api_json("GET", f"/exec/{urllib.parse.quote(exec_id, safe='')}/json", timeout=timeout)
    exit_code = inspect.get("body", {}).get("ExitCode") if isinstance(inspect.get("body"), dict) else None

    stdout = decode_docker_raw_stream(start.get("raw_bytes", b"")).strip()
    return {
        "ok": bool(start.get("ok") and exit_code == 0),
        "stdout": stdout,
        "stderr_tail": "" if exit_code == 0 else stdout[-2000:],
        "exit_code": exit_code,
    }


def psql_imuni(*_: Any, **__: Any) -> dict[str, Any]:
    """Fail closed until stdin-based SQL transport is reviewed.

    SQL text and variables can contain patient data and must not be exposed in
    Docker exec argv or process metadata.
    """
    return {
        "ok": False,
        "blocked": True,
        "reason": "stdin-based psql transport is not implemented in this helper.",
        "would_execute": False,
        "executed": False,
        "real_patient_data_persisted": False,
        "clinical_data_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
    }


def kv_lines_to_dict(stdout: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (stdout or "").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip()
    return out
