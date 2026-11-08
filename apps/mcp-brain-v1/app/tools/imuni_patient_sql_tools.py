
from __future__ import annotations

import hashlib
import hmac
import http.client
import json
import os
import secrets
import socket
import urllib.parse
from datetime import datetime, timezone
from typing import Any

from .imuni_base_tools import base_result

_CONFIRM = "IGOR_APROVA_R5_IMUNI_PATIENT_REAL_V1"
_CRED_HASH_ENV = "IMUNI_R5_INTERNAL_CREDENTIAL_SHA256"
_FIELD_KEY_ENV = "IMUNI_FIELD_ENCRYPTION_KEY"


class _UnixHTTPConnection(http.client.HTTPConnection):
    def __init__(self, unix_socket_path: str):
        super().__init__("localhost")
        self.unix_socket_path = unix_socket_path

    def connect(self) -> None:
        self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.sock.connect(self.unix_socket_path)


def _credential_ok(args: dict[str, Any]) -> bool:
    expected = os.environ.get(_CRED_HASH_ENV, "").strip()
    supplied = str(args.get("operator_credential") or "")
    if not expected or not supplied:
        return False
    actual = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual, expected)


def _field_key() -> str:
    return os.environ.get(_FIELD_KEY_ENV, "").strip()


def _cpf_hash(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return hashlib.sha256(digits.encode("utf-8")).hexdigest() if digits else ""


def _gate(tool: str, args: dict[str, Any], *, needs_key: bool = False) -> dict[str, Any] | None:
    if args.get("confirmacao") != _CONFIRM:
        return base_result(tool, {"ok": False, "blocked": True, "reason": "human R5 confirmation required.", "would_execute": False, "executed": False, "clinical_data_persisted": False})
    if not _credential_ok(args):
        return base_result(tool, {"ok": False, "blocked": True, "reason": "internal server-side credential required.", "would_execute": False, "executed": False, "clinical_data_persisted": False, "secret_value_exposed": False})
    if needs_key and not _field_key():
        return base_result(tool, {"ok": False, "blocked": True, "reason": "field encryption key is not configured.", "would_execute": False, "executed": False, "clinical_data_persisted": False, "secret_value_exposed": False})
    return None


def _docker_api(method: str, path: str, body: dict[str, Any] | None = None, timeout: int = 20) -> dict[str, Any]:
    conn = _UnixHTTPConnection("/var/run/docker.sock")
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
        return {"ok": 200 <= resp.status < 300, "body": parsed, "raw": raw[:8000]}
    except Exception as exc:
        return {"ok": False, "body": None, "raw": f"{exc.__class__.__name__}: {exc}"}
    finally:
        try:
            conn.close()
        except Exception:
            pass


def _docker_exec(cmd: list[str], timeout: int = 25) -> dict[str, Any]:
    create = _docker_api("POST", "/containers/imuni-postgres/exec", {
        "AttachStdout": True,
        "AttachStderr": True,
        "Tty": False,
        "Cmd": cmd,
    }, timeout=timeout)
    if not create.get("ok") or not isinstance(create.get("body"), dict) or not create["body"].get("Id"):
        return {"ok": False, "stdout": "", "stderr_tail": str(create.get("raw") or create.get("body"))[-1000:], "exit_code": None}
    exec_id = create["body"]["Id"]
    start = _docker_api("POST", f"/exec/{urllib.parse.quote(exec_id, safe='')}/start", {"Detach": False, "Tty": False}, timeout=timeout)
    inspect = _docker_api("GET", f"/exec/{urllib.parse.quote(exec_id, safe='')}/json", timeout=timeout)
    exit_code = inspect.get("body", {}).get("ExitCode") if isinstance(inspect.get("body"), dict) else None
    raw = start.get("raw") or ""
    clean = "".join(ch for ch in raw if ch == "\n" or ch == "\t" or 32 <= ord(ch) <= 126 or ord(ch) > 127).strip()
    return {"ok": bool(start.get("ok") and exit_code == 0), "stdout": clean, "stderr_tail": "" if exit_code == 0 else clean[-2000:], "exit_code": exit_code}


def _psql(sql: str, variables: dict[str, str], timeout: int = 25) -> dict[str, Any]:
    cmd = ["psql", "-U", "imuni_app", "-d", "imuni_clinical", "-v", "ON_ERROR_STOP=1", "-At"]
    for key, value in variables.items():
        cmd.extend(["-v", f"{key}={value}"])
    cmd.extend(["-c", sql])
    return _docker_exec(cmd, timeout=timeout)


def _kv(stdout: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for line in (stdout or "").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            out[key.strip()] = value.strip()
    return out


def _patient_code() -> str:
    return "PAT-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()


def create_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args, needs_key=True):
        return blocked
    full_name = str(args.get("full_name") or "").strip()
    if len(full_name) < 2:
        return base_result(tool, {"ok": False, "blocked": True, "reason": "full_name is required.", "would_execute": False, "executed": False})
    code = _patient_code()
    sql = """
    with ctx as (
      select t.id tenant_id, p.id practitioner_id
      from imuni.tenants t join imuni.practitioners p on p.tenant_id=t.id
      where t.slug='imuni-igor-private' and p.crm='18700' and p.crm_uf='SC' and t.status='active' and p.status='active'
      limit 1
    ), ins as (
      insert into imuni.patients (
        tenant_id, patient_code, full_name_encrypted, cpf_hash,
        birth_date_encrypted, phone_encrypted, phone_hash, email_encrypted, email_hash,
        emergency_contact_encrypted, status, created_by
      )
      select tenant_id, :'code',
        encode(pgp_sym_encrypt(:'full_name', :'field_key'), 'base64'),
        nullif(:'cpf_hash',''),
        case when :'birth_date'='' then null else encode(pgp_sym_encrypt(:'birth_date', :'field_key'), 'base64') end,
        case when :'phone'='' then null else encode(pgp_sym_encrypt(:'phone', :'field_key'), 'base64') end,
        nullif(:'phone_hash',''),
        case when :'email'='' then null else encode(pgp_sym_encrypt(:'email', :'field_key'), 'base64') end,
        nullif(:'email_hash',''),
        case when :'emergency_contact'='' then null else encode(pgp_sym_encrypt(:'emergency_contact', :'field_key'), 'base64') end,
        'active', practitioner_id
      from ctx
      returning id, tenant_id, patient_code, status, created_by
    ), audit as (
      insert into imuni_audit.events (tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json)
      select tenant_id, created_by, 'physician_admin', 'patient.create_REAL', 'patient', id,
        coalesce(nullif(:'cpf_hash',''), encode(digest(patient_code, 'sha256'), 'hex')),
        jsonb_build_object('tool','imuni.patient.create_REAL','hard_delete',false,'raw_patient_data_in_audit',false)
      from ins returning id
    )
    select 'patient_id='||id||chr(10)||'tenant_id='||tenant_id||chr(10)||'patient_code='||patient_code||chr(10)||'status='||status||chr(10)||'audit_events_created='||(select count(*)::text from audit)
    from ins;
    """
    phone = str(args.get("phone") or "").strip()
    email = str(args.get("email") or "").strip()
    res = _psql(sql, {
        "code": code,
        "full_name": full_name,
        "cpf_hash": _cpf_hash(args.get("cpf")),
        "birth_date": str(args.get("birth_date") or "").strip(),
        "phone": phone,
        "phone_hash": hashlib.sha256(phone.encode("utf-8")).hexdigest() if phone else "",
        "email": email,
        "email_hash": hashlib.sha256(email.lower().encode("utf-8")).hexdigest() if email else "",
        "emergency_contact": str(args.get("emergency_contact") or "").strip(),
        "field_key": _field_key(),
    }, timeout=30)
    fields = _kv(res.get("stdout", ""))
    ok = bool(res.get("ok") and fields.get("patient_id"))
    return base_result(tool, {"ok": ok, "executed": ok, "would_execute": ok, "database": "imuni_clinical", "patient": {"id": fields.get("patient_id"), "tenant_id": fields.get("tenant_id"), "patient_code": fields.get("patient_code"), "status": fields.get("status")}, "audit_events_created": fields.get("audit_events_created"), "clinical_payload_persisted": False, "real_patient_data_persisted": ok, "raw_patient_data_returned": False, "secret_value_exposed": False, "dsn_exposed": False, "hard_delete": False, "diagnostic_error_tail": res.get("stderr_tail") if not ok else ""})


def search_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args):
        return blocked
    code = str(args.get("patient_code") or "").strip()
    cpf_hash = _cpf_hash(args.get("cpf"))
    if not code and not cpf_hash:
        return base_result(tool, {"ok": False, "blocked": True, "reason": "patient_code or cpf is required.", "would_execute": False, "executed": False})
    limit = str(max(1, min(int(args.get("limit") or 10), 20)))
    sql = """
    with ctx as (select id tenant_id from imuni.tenants where slug='imuni-igor-private' and status='active' limit 1)
    select 'patient_code='||p.patient_code||chr(9)||'status='||p.status||chr(9)||'created_at='||p.created_at::text||chr(9)||'archived_at='||coalesce(p.archived_at::text,'')
    from imuni.patients p, ctx
    where p.tenant_id=ctx.tenant_id and ((:'code'<>'' and p.patient_code=:'code') or (:'cpf_hash'<>'' and p.cpf_hash=:'cpf_hash'))
    order by p.created_at desc limit :limit;
    """
    res = _psql(sql, {"code": code, "cpf_hash": cpf_hash, "limit": limit})
    rows = []
    for line in (res.get("stdout") or "").splitlines():
        item = {}
        for part in line.split("\t"):
            if "=" in part:
                k, v = part.split("=", 1)
                item[k] = v
        if item:
            rows.append(item)
    return base_result(tool, {"ok": bool(res.get("ok")), "executed": bool(res.get("ok")), "would_execute": bool(res.get("ok")), "count": len(rows), "patients": rows, "raw_patient_data_returned": False, "clinical_payload_persisted": False, "real_patient_data_persisted": False, "secret_value_exposed": False, "dsn_exposed": False, "diagnostic_error_tail": res.get("stderr_tail") if not res.get("ok") else ""})


def archive_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args):
        return blocked
    code = str(args.get("patient_code") or "").strip()
    if not code:
        return base_result(tool, {"ok": False, "blocked": True, "reason": "patient_code is required.", "would_execute": False, "executed": False})
    reason = str(args.get("reason") or "operator_request").strip()[:500]
    sql = """
    with ctx as (
      select t.id tenant_id, p.id practitioner_id
      from imuni.tenants t join imuni.practitioners p on p.tenant_id=t.id
      where t.slug='imuni-igor-private' and p.crm='18700' and p.crm_uf='SC' and t.status='active' and p.status='active'
      limit 1
    ), upd as (
      update imuni.patients p set status='archived', archived_at=now(), updated_at=now()
      from ctx where p.tenant_id=ctx.tenant_id and p.patient_code=:'code' and p.status<>'archived'
      returning p.id, p.tenant_id, p.patient_code, p.status, p.cpf_hash, ctx.practitioner_id
    ), audit as (
      insert into imuni_audit.events (tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json)
      select tenant_id, practitioner_id, 'physician_admin', 'patient.archive_REAL', 'patient', id,
        coalesce(cpf_hash, encode(digest(patient_code, 'sha256'), 'hex')),
        jsonb_build_object('tool','imuni.patient.archive_REAL','hard_delete',false,'reason',:'reason','raw_patient_data_in_audit',false)
      from upd returning id
    )
    select 'patient_id='||id||chr(10)||'tenant_id='||tenant_id||chr(10)||'patient_code='||patient_code||chr(10)||'status='||status||chr(10)||'audit_events_created='||(select count(*)::text from audit)
    from upd;
    """
    res = _psql(sql, {"code": code, "reason": reason})
    fields = _kv(res.get("stdout", ""))
    ok = bool(res.get("ok") and fields.get("patient_id"))
    return base_result(tool, {"ok": ok, "executed": ok, "would_execute": ok, "patient": {"id": fields.get("patient_id"), "tenant_id": fields.get("tenant_id"), "patient_code": fields.get("patient_code"), "status": fields.get("status")}, "audit_events_created": fields.get("audit_events_created"), "hard_delete": False, "raw_patient_data_returned": False, "clinical_payload_persisted": False, "real_patient_data_persisted": False, "secret_value_exposed": False, "dsn_exposed": False, "diagnostic_error_tail": res.get("stderr_tail") if not ok else ""})


def call_patient_sql_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.patient.create_REAL":
        return create_patient(tool, args)
    if tool == "imuni.patient.search_REAL":
        return search_patient(tool, args)
    if tool == "imuni.patient.archive_REAL":
        return archive_patient(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni patient sql tool", "would_execute": False}}
