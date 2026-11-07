from __future__ import annotations

import http.client
import json
import socket
import urllib.parse
from typing import Any

from .imuni_base_tools import base_result

PRACTITIONER_TOOL_DEFINITIONS = [
    {
        "name": "imuni.practitioner.upsert_IGOR_REAL",
        "risk": "R5",
        "category": "imuni_db",
        "mode": "real_practitioner_profile_write",
        "plugin_ready": True,
        "would_execute": True,
        "requires_confirmation": True,
        "required_confirmation": "IGOR_APROVA_R5_CADASTRO_MEDICO_IMUNI",
        "description": (
            "Cria/atualiza o cadastro profissional real do médico Igor no Imuni. "
            "Não cria paciente real e não ativa escrita clínica geral."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"confirmacao": {"type": "string"}},
            "required": ["confirmacao"],
        },
    }
]


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str):
        super().__init__("localhost")
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.unix_socket_path)


def is_practitioner_tool(tool: str) -> bool:
    return any(item["name"] == tool for item in PRACTITIONER_TOOL_DEFINITIONS)


def _docker_api(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 20) -> dict[str, Any]:
    conn = _UnixHTTPConnection("/var/run/docker.sock")
    conn.timeout = timeout
    try:
        payload = None
        headers = {}
        if body is not None:
            payload = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
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


def _docker_exec_fixed(container: str, cmd: list[str], timeout: int = 20) -> dict[str, Any]:
    create = _docker_api("POST", f"/containers/{urllib.parse.quote(container, safe='')}/exec", {
        "AttachStdout": True,
        "AttachStderr": True,
        "Tty": False,
        "Cmd": cmd,
    }, timeout=timeout)
    if not create.get("ok") or not isinstance(create.get("body"), dict) or not create["body"].get("Id"):
        return {"ok": False, "stdout": "", "stderr_tail": str(create.get("raw") or create.get("body"))[-1000:], "exit_code": None}

    exec_id = create["body"]["Id"]
    start = _docker_api("POST", f"/exec/{exec_id}/start", {"Detach": False, "Tty": False}, timeout=timeout)
    inspect = _docker_api("GET", f"/exec/{exec_id}/json", timeout=timeout)
    exit_code = None
    if isinstance(inspect.get("body"), dict):
        exit_code = inspect["body"].get("ExitCode")

    raw = start.get("raw") or ""
    clean = "".join(ch for ch in raw if ch == "\n" or ch == "\t" or 32 <= ord(ch) <= 126 or ord(ch) > 127).strip()
    return {"ok": bool(start.get("ok") and exit_code == 0), "stdout": clean[:8000], "stderr_tail": "" if exit_code == 0 else clean[-1000:], "exit_code": exit_code}


def _parse_key_values(stdout: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    keys = ("practitioner_id", "tenant_id", "name", "crm", "crm_uf", "role", "status", "audit_events_created")
    for raw_line in (stdout or "").splitlines():
        line = "".join(ch for ch in raw_line if ch.isprintable()).strip()
        for key in keys:
            pos = line.find(key + "=")
            if pos >= 0:
                normalized = line[pos:]
                k, v = normalized.split("=", 1)
                fields[k] = v
                break
    return fields


def _upsert_igor_real(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("confirmacao") != "IGOR_APROVA_R5_CADASTRO_MEDICO_IMUNI":
        return base_result(tool, {"ok": False, "blocked": True, "reason": "IGOR_APROVA_R5_CADASTRO_MEDICO_IMUNI confirmation required.", "would_execute": False, "clinical_data_persisted": False})

    sql = """
    with tenant as (
      insert into imuni.tenants (slug, display_name, status)
      values ('imuni-igor-private', 'Imuni Médico Igor', 'active')
      on conflict (slug) do update
        set display_name = excluded.display_name,
            status = 'active'
      returning id
    ), practitioner as (
      insert into imuni.practitioners (tenant_id, name, crm, crm_uf, role, status)
      select id, 'Igor Paulo da Silva Abreu', '18700', 'SC', 'physician_admin', 'active'
      from tenant
      on conflict (tenant_id, crm, crm_uf) do update
        set name = excluded.name,
            role = excluded.role,
            status = 'active',
            updated_at = now()
      returning id, tenant_id, name, crm, crm_uf, role, status
    ), audit as (
      insert into imuni_audit.events (tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json)
      select tenant_id,
             id,
             'physician_admin',
             'practitioner.upsert_IGOR_REAL',
             'practitioner',
             id,
             null,
             jsonb_build_object(
               'tool', 'imuni.practitioner.upsert_IGOR_REAL',
               'scope', 'practitioner_profile_only',
               'real_patient_data', false,
               'clinical_writes_enabled', false,
               'production_writes_enabled', false,
               'permissions', jsonb_build_array('admin','physician','patients:create','patients:read','patients:archive','encounters:create','encounters:update_draft','encounters:sign','notes:add','attachments:add','audit:read'),
               'cpf_raw_stored', false
             )
      from practitioner
      returning id
    )
    select 'practitioner_id=' || practitioner.id::text || chr(10) ||
           'tenant_id=' || practitioner.tenant_id::text || chr(10) ||
           'name=' || practitioner.name || chr(10) ||
           'crm=' || practitioner.crm || chr(10) ||
           'crm_uf=' || practitioner.crm_uf || chr(10) ||
           'role=' || practitioner.role || chr(10) ||
           'status=' || practitioner.status || chr(10) ||
           'audit_events_created=' || (select count(*)::text from audit)
    from practitioner;
    """
    res = _docker_exec_fixed("imuni-postgres", ["psql", "-U", "imuni_app", "-d", "imuni_clinical", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql], timeout=20)
    fields = _parse_key_values(res.get("stdout") or "")

    return base_result(tool, {
        "ok": bool(res.get("ok") and fields.get("practitioner_id")),
        "database": "imuni_clinical",
        "environment": "staging_dev_private_real_practitioner",
        "practitioner": {
            "id": fields.get("practitioner_id"),
            "tenant_id": fields.get("tenant_id"),
            "name": fields.get("name"),
            "crm": fields.get("crm"),
            "crm_uf": fields.get("crm_uf"),
            "role": fields.get("role"),
            "status": fields.get("status"),
            "specialty": "Clínico geral",
        },
        "permissions_modeled": ["admin", "physician", "patients:create", "patients:read", "patients:archive", "encounters:create", "encounters:update_draft", "encounters:sign", "notes:add", "attachments:add", "audit:read"],
        "audit_events_created": fields.get("audit_events_created"),
        "cpf_raw_stored": False,
        "real_patient_data_persisted": False,
        "clinical_writes_enabled": False,
        "production_writes_enabled": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": res.get("stderr_tail") if not res.get("ok") else "",
    })


def call_practitioner_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.practitioner.upsert_IGOR_REAL":
        return _upsert_igor_real(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni practitioner tool", "would_execute": False}}
