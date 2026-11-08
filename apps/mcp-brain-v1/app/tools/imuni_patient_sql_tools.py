
from __future__ import annotations

import re
import secrets
from datetime import datetime, timezone
from typing import Any

from .imuni_base_tools import base_result
from .imuni_psql_file_transport import psql_file_imuni
from .imuni_r5_controls import (
    email_hmac_lookup,
    hmac_lookup,
    require_patient_write_controls,
    verify_operator_credential,
)

_CONFIRM_SEARCH = "IGOR_APROVA_R5_IMUNI_PATIENT_SEARCH_READONLY_V1"
_CONFIRM_WRITE = "IGOR_APROVA_R5_IMUNI_PATIENT_WRITE_REAL_V1"
_PATIENT_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,79}$")
_UUID_RE = re.compile(r"^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
_ARCHIVE_REASONS = {"operator_request", "duplicate_record", "incorrect_record", "patient_request", "lgpd_request", "other"}


def _blocked(tool: str, reason: str) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": reason,
        "would_execute": False,
        "executed": False,
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": False,
        "raw_patient_data_returned": False,
        "hard_delete": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
    })


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _safe_limit(value: Any, default: int = 10) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, 20))


def _require_uuid_arg(tool: str, args: dict[str, Any], name: str) -> tuple[bool, str | dict[str, Any]]:
    value = str(args.get(name) or "").strip()
    if not _UUID_RE.fullmatch(value):
        return False, _blocked(tool, f"{name} is required as UUID to establish RLS context.")
    return True, value.lower()


def _verify_r5(tool: str, args: dict[str, Any], expected_confirmation: str, *, require_write_controls: bool) -> tuple[bool, dict[str, Any] | Any]:
    if args.get("confirmacao") != expected_confirmation:
        return False, _blocked(tool, "human R5 confirmation required.")
    if not verify_operator_credential(args):
        return False, _blocked(tool, "internal server-side operator credential required.")
    ok_tenant, tenant_id = _require_uuid_arg(tool, args, "tenant_id")
    if not ok_tenant:
        return False, tenant_id
    ok_practitioner, practitioner_id = _require_uuid_arg(tool, args, "practitioner_id")
    if not ok_practitioner:
        return False, practitioner_id
    controls = None
    if require_write_controls:
        controls_ok, controls_or_reason = require_patient_write_controls(args)
        if not controls_ok:
            return False, _blocked(tool, str(controls_or_reason))
        controls = controls_or_reason
    return True, {"tenant_id": tenant_id, "practitioner_id": practitioner_id, "controls": controls}


def _parse_rows(stdout: str) -> list[dict[str, str]]:
    rows: list[dict[str, str]] = []
    for line in (stdout or "").splitlines():
        row: dict[str, str] = {}
        for part in line.split("\t"):
            if "=" in part:
                key, value = part.split("=", 1)
                row[key] = value
        if row:
            rows.append(row)
    return rows


def _fields_from_multiline(stdout: str) -> dict[str, str]:
    fields: dict[str, str] = {}
    for line in (stdout or "").splitlines():
        if "=" in line:
            key, value = line.split("=", 1)
            fields[key] = value
    return fields


def _patient_code() -> str:
    return "PAT-" + datetime.now(timezone.utc).strftime("%Y%m%d") + "-" + secrets.token_hex(3).upper()


def _cpf_lookup(tool: str, args: dict[str, Any], controls: Any | None = None) -> tuple[bool, str | dict[str, Any]]:
    if not args.get("cpf"):
        return True, ""
    if controls is None:
        controls_ok, controls_or_reason = require_patient_write_controls(args)
        if not controls_ok:
            return False, _blocked(tool, str(controls_or_reason))
        controls = controls_or_reason
    return True, hmac_lookup(args.get("cpf"), controls.lookup_hmac_key) or ""


def _search_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    ok, gate = _verify_r5(tool, args, _CONFIRM_SEARCH, require_write_controls=False)
    if not ok:
        return gate
    patient_code = str(args.get("patient_code") or "").strip().upper()
    if patient_code and not _PATIENT_CODE_RE.fullmatch(patient_code):
        return _blocked(tool, "patient_code has invalid format.")
    ok_cpf, cpf_lookup = _cpf_lookup(tool, args)
    if not ok_cpf:
        return cpf_lookup
    if not patient_code and not cpf_lookup:
        return _blocked(tool, "patient_code or cpf is required.")
    filters: list[str] = []
    if patient_code:
        filters.append(f"p.patient_code = {_sql_literal(patient_code)}")
    if cpf_lookup:
        filters.append(f"p.cpf_hash = {_sql_literal(str(cpf_lookup))}")
    sql = f"""
with app_context as (
  select
    set_config('imuni.tenant_id', {_sql_literal(str(gate['tenant_id']))}, true) as tenant_ctx,
    set_config('imuni.practitioner_id', {_sql_literal(str(gate['practitioner_id']))}, true) as practitioner_ctx
)
select
  'patient_code=' || p.patient_code || chr(9) ||
  'status=' || p.status || chr(9) ||
  'created_at=' || p.created_at::text || chr(9) ||
  'archived_at=' || coalesce(p.archived_at::text, '')
from imuni.patients p, app_context
where p.tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
  and ({' or '.join(filters)})
order by p.created_at desc
limit {_safe_limit(args.get('limit'))};
"""
    result = psql_file_imuni(sql, variables=None, timeout=25)
    rows = _parse_rows(result.get("stdout") or "")
    ok_result = bool(result.get("ok"))
    return base_result(tool, {
        "ok": ok_result,
        "executed": ok_result,
        "would_execute": ok_result,
        "count": len(rows),
        "patients": rows,
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": False,
        "raw_patient_data_returned": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not ok_result else "",
    })


def _create_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    ok, gate = _verify_r5(tool, args, _CONFIRM_WRITE, require_write_controls=True)
    if not ok:
        return gate
    controls = gate["controls"]
    full_name = str(args.get("full_name") or "").strip()
    if len(full_name) < 2:
        return _blocked(tool, "full_name is required.")
    patient_code = str(args.get("patient_code") or "").strip().upper() or _patient_code()
    if not _PATIENT_CODE_RE.fullmatch(patient_code):
        return _blocked(tool, "patient_code has invalid format.")
    cpf_lookup = hmac_lookup(args.get("cpf"), controls.lookup_hmac_key) or ""
    phone = str(args.get("phone") or "").strip()
    phone_lookup = hmac_lookup(phone, controls.lookup_hmac_key) if phone else ""
    email = str(args.get("email") or "").strip()
    email_lookup = email_hmac_lookup(email, controls.lookup_hmac_key) if email else ""
    birth_date = str(args.get("birth_date") or "").strip()
    emergency_contact = str(args.get("emergency_contact") or "").strip()
    sql = f"""
with app_context as (
  select
    set_config('imuni.tenant_id', {_sql_literal(str(gate['tenant_id']))}, true) as tenant_ctx,
    set_config('imuni.practitioner_id', {_sql_literal(str(gate['practitioner_id']))}, true) as practitioner_ctx
), ins as (
  insert into imuni.patients (
    tenant_id, patient_code, full_name_encrypted, cpf_hash,
    birth_date_encrypted, phone_encrypted, phone_hash, email_encrypted, email_hash,
    emergency_contact_encrypted, status, created_by
  )
  select
    nullif(current_setting('imuni.tenant_id', true), '')::uuid,
    {_sql_literal(patient_code)},
    encode(pgp_sym_encrypt({_sql_literal(full_name)}, {_sql_literal(controls.encryption_key)}), 'base64'),
    nullif({_sql_literal(cpf_lookup)}, ''),
    case when {_sql_literal(birth_date)} = '' then null else encode(pgp_sym_encrypt({_sql_literal(birth_date)}, {_sql_literal(controls.encryption_key)}), 'base64') end,
    case when {_sql_literal(phone)} = '' then null else encode(pgp_sym_encrypt({_sql_literal(phone)}, {_sql_literal(controls.encryption_key)}), 'base64') end,
    nullif({_sql_literal(phone_lookup or '')}, ''),
    case when {_sql_literal(email)} = '' then null else encode(pgp_sym_encrypt({_sql_literal(email)}, {_sql_literal(controls.encryption_key)}), 'base64') end,
    nullif({_sql_literal(email_lookup or '')}, ''),
    case when {_sql_literal(emergency_contact)} = '' then null else encode(pgp_sym_encrypt({_sql_literal(emergency_contact)}, {_sql_literal(controls.encryption_key)}), 'base64') end,
    'active',
    {_sql_literal(str(gate['practitioner_id']))}::uuid
  from app_context
  returning id, tenant_id, patient_code, status, created_by
), audit as (
  insert into imuni_audit.events (
    tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json
  )
  select
    tenant_id, created_by, 'physician_admin', 'patient.create_REAL', 'patient', id,
    coalesce(nullif({_sql_literal(cpf_lookup)}, ''), encode(digest(patient_code, 'sha256'), 'hex')),
    jsonb_build_object(
      'tool','imuni.patient.create_REAL',
      'hard_delete',false,
      'raw_patient_data_in_audit',false,
      'encrypted_fields',jsonb_build_array('full_name','birth_date','phone','email','emergency_contact'),
      'lookup_hmac_key_id',{_sql_literal(controls.lookup_hmac_key_id)},
      'encryption_key_id',{_sql_literal(controls.encryption_key_id)}
    )
  from ins
  returning id
)
select
  'patient_id=' || id::text || chr(10) ||
  'tenant_id=' || tenant_id::text || chr(10) ||
  'patient_code=' || patient_code || chr(10) ||
  'status=' || status || chr(10) ||
  'audit_events_created=' || (select count(*)::text from audit)
from ins;
"""
    result = psql_file_imuni(sql, variables=None, timeout=30)
    fields = _fields_from_multiline(result.get("stdout") or "")
    ok_result = bool(result.get("ok") and fields.get("patient_id"))
    return base_result(tool, {
        "ok": ok_result,
        "executed": ok_result,
        "would_execute": ok_result,
        "database": "imuni_clinical",
        "patient": {
            "id": fields.get("patient_id"),
            "tenant_id": fields.get("tenant_id"),
            "patient_code": fields.get("patient_code"),
            "status": fields.get("status"),
        },
        "audit_events_created": fields.get("audit_events_created"),
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": ok_result,
        "raw_patient_data_returned": False,
        "hard_delete": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not ok_result else "",
    })


def _archive_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    ok, gate = _verify_r5(tool, args, _CONFIRM_WRITE, require_write_controls=False)
    if not ok:
        return gate
    patient_code = str(args.get("patient_code") or "").strip().upper()
    if not patient_code:
        return _blocked(tool, "patient_code is required.")
    if not _PATIENT_CODE_RE.fullmatch(patient_code):
        return _blocked(tool, "patient_code has invalid format.")
    reason_code = str(args.get("reason_code") or args.get("reason") or "operator_request").strip().lower()
    if reason_code not in _ARCHIVE_REASONS:
        reason_code = "other"
    sql = f"""
with app_context as (
  select
    set_config('imuni.tenant_id', {_sql_literal(str(gate['tenant_id']))}, true) as tenant_ctx,
    set_config('imuni.practitioner_id', {_sql_literal(str(gate['practitioner_id']))}, true) as practitioner_ctx
), upd as (
  update imuni.patients p
  set status = 'archived',
      archived_at = now(),
      updated_at = now()
  from app_context
  where p.tenant_id = nullif(current_setting('imuni.tenant_id', true), '')::uuid
    and p.patient_code = {_sql_literal(patient_code)}
    and p.status <> 'archived'
  returning p.id, p.tenant_id, p.patient_code, p.status, p.cpf_hash
), audit as (
  insert into imuni_audit.events (
    tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json
  )
  select
    tenant_id, {_sql_literal(str(gate['practitioner_id']))}::uuid, 'physician_admin',
    'patient.archive_REAL', 'patient', id,
    coalesce(cpf_hash, encode(digest(patient_code, 'sha256'), 'hex')),
    jsonb_build_object('tool','imuni.patient.archive_REAL','hard_delete',false,'reason_code',{_sql_literal(reason_code)},'raw_patient_data_in_audit',false)
  from upd
  returning id
)
select
  'patient_id=' || id::text || chr(10) ||
  'tenant_id=' || tenant_id::text || chr(10) ||
  'patient_code=' || patient_code || chr(10) ||
  'status=' || status || chr(10) ||
  'audit_events_created=' || (select count(*)::text from audit)
from upd;
"""
    result = psql_file_imuni(sql, variables=None, timeout=25)
    fields = _fields_from_multiline(result.get("stdout") or "")
    ok_result = bool(result.get("ok") and fields.get("patient_id"))
    return base_result(tool, {
        "ok": ok_result,
        "executed": ok_result,
        "would_execute": ok_result,
        "patient": {
            "id": fields.get("patient_id"),
            "tenant_id": fields.get("tenant_id"),
            "patient_code": fields.get("patient_code"),
            "status": fields.get("status"),
        },
        "audit_events_created": fields.get("audit_events_created"),
        "hard_delete": False,
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": False,
        "raw_patient_data_returned": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not ok_result else "",
    })


def call_patient_sql_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.patient.search_REAL":
        return _search_patient(tool, args)
    if tool == "imuni.patient.create_REAL":
        return _create_patient(tool, args)
    if tool == "imuni.patient.archive_REAL":
        return _archive_patient(tool, args)
    return _blocked(tool, "unknown patient SQL tool.")


def call_patient_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    return call_patient_sql_tool(tool, args)


def call_patient_sql_real_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    return call_patient_sql_tool(tool, args)
