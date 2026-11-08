from __future__ import annotations

import http.client
import io
import json
import secrets
import socket
import tarfile
import urllib.parse
from typing import Any

from .imuni_psql_transport import IMUNI_POSTGRES_CONTAINER, docker_exec

DOCKER_SOCKET_PATH = "/var/run/docker.sock"
IMUNI_DB_NAME = "imuni_clinical"
IMUNI_DB_USER = "imuni_app"
SQL_TMP_DIR = "/tmp"


class UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, timeout: int = 25):
        super().__init__("localhost", timeout=timeout)

    def connect(self) -> None:
        sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        if self.timeout is not None:
            sock.settimeout(self.timeout)
        sock.connect(DOCKER_SOCKET_PATH)
        self.sock = sock


def docker_raw_request(
    method: str,
    path: str,
    body: bytes | None = None,
    headers: dict[str, str] | None = None,
    timeout: int = 25,
) -> dict[str, Any]:
    conn = UnixHTTPConnection(timeout=timeout)
    try:
        conn.request(method, path, body=body, headers=headers or {})
        resp = conn.getresponse()
        raw = resp.read()
        return {"ok": 200 <= resp.status < 300, "status": resp.status, "raw_bytes": raw}
    except Exception as exc:
        return {"ok": False, "status": 0, "raw_bytes": b", "raw": f"{exc.__class__.__name__}: {exc}"}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def tar_single_file(filename: str, content: bytes) -> bytes:
    """Create a tar archive containing one safe basename file."""
    if "/" in filename or filename in {"", ".", ".."}:
        raise ValueError("filename must be a safe basename")
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w") as tar:
        info = tarfile.TarInfo(filename)
        info.size = len(content)
        info.mode = 0o600
        tar.addfile(info, io.BytesIO(content))
    return buf.getvalue()


def put_text_file(container: str, directory: str, filename: str, content: str, timeout: int = 25) -> dict[str, Any]:
    """Upload text to a container using Docker Archive API."""
    tar_payload = tar_single_file(filename, content.encode("utf-8"))
    quoted_container = urllib.parse.quote(container, safe="")
    quoted_path = urllib.parse.quote(directory, safe="")
    return docker_raw_request(
        "PUT",
        f"/containers/{quoted_container}/archive?path={quoted_path}",
        body=tar_payload,
        headers={"Content-Type": "application/x-tar"},
        timeout=timeout,
    )


def psql_file_imuni(sql: str, variables: dict[str, str] | None = None, timeout: int = 25) -> dict[str, Any]:
    """Run psql through a temporary SQL file, not argv.

    SQL is uploaded through Docker Archive API. Variables are deliberately
    rejected for now because psql -v places values in Docker's persisted Cmd.
    """
    if not sql.strip():
        return {"ok": False, "blocked": True, "reason": "sql is required.", "would_execute": False, "executed": False}

    if variables:
        return {
            "ok": False,
            "blocked": True,
            "reason": "psql variables are blocked until a non-argv variable transport is reviewed.",
            "would_execute": False,
            "executed": False,
            "secret_value_exposed": False,
            "dsn_exposed": False,
        }

    filename = f"imuni_query_{secrets.token_hex(8)}.sql"
    remote_path = f"{SQL_TMP_DIR}/{filename}"
    upload = put_text_file(IMUNI_POSTGRES_CONTAINER, SQL_TMP_DIR, filename, sql, timeout=timeout)
    if not upload.get("ok"):
        return {
            "ok": False,
            "stdout": "",
            "stderr_tail": str(upload.get("raw") or upload.get("raw_bytes", b""))[-1000:],
            "exit_code": None,
            "executed": False,
        }

    cmd = ["psql", "-U", IMUNI_DB_USER, "-d", IMUNI_DB_NAME, "-v", "ON_ERROR_STOP=1", "-At", "-f", remote_path]

    try:
        result = docker_exec(IMUNI_POSTGRES_CONTAINER, cmd, timeout=timeout)
    finally:
        docker_exec(IMUNI_POSTGRES_CONTAINER, ["rm", "-f", remote_path], timeout=timeout)

    result["executed"] = bool(result.get("ok"))
    result["would_execute"] = bool(result.get("ok"))
    result["secret_value_exposed"] = False
    result["dsn_exposed"] = False
    return result
