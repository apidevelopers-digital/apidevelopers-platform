
from __future__ import annotations

import hashlib
import hmac
import os
from typing import Any

from .imuni_base_tools import base_result
from .imuni_practitioner_tools import _docker_exec_fixed

_INTERNAL_CREDENTIAL_ENV = "IMUNI_R5_INTERNAL_CREDENTIAL_SHA256"
_HUMAN_CONFIRMATION = "IGOR_APROVA_R5_IMUNI_PATIENT_REAL_V1"

PATIENT_TOOL_DEFINITIONS = [
    {
        "name": "imuni.patient.create_REAL",
        "risk": "R5",
        "category": "imuni_db",
        "mode": "real_patient_write",
        "plugin_ready": True,
        "would_execute": True,
        "requires_confirmation": True,
        "requires_private_operator_credential": True,
        "required_confirmation": "R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED",
        "description": (
            "Cria paciente real no Imuni com dados pessoais criptografados, hashes para busca, grant admin para Igor "
            "e auditoria sem payload clinico bruto."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "confirmacao": {"type": "string"},
                "operator_credential": {"type": "string"},
                "full_name": {"type": "string", "minLength": 2},
                "cpf": {"type": "string"},
                "birth_date": {"type": "string"},
                "phone": {"type": "string"},
                "email": {"type": "string"},
                "emergency_contact": {"type": "string"},
            },
            "required": ["confirmacao", "operator_credential", "full_name"],
        },
    },
    {
        "name": "imuni.patient.search_REAL",
        "risk": "R5",
        "category": "imuni_db",
        "mode": "real_patient_read",
        "plugin_ready": True,
        "would_execute": True,
        "requires_confirmation": True,
        "requires_private_operator_credential": True,
        "required_confirmation": "R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED",
        "description": "Busca paciente real por patient_code ou CPF com gate R5 e credencial interna valida.",
        "input_schema": {
            "type": "object",
            "properties": {
                "confirmacao": {"type": "string"},
                "operator_credential": {"type": "string"},
                "patient_code": {"type": "string"},
                "cpf": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 20},
            },
            "required": ["confirmacao", "operator_credential"],
        },
    },
    {
        "name": "imuni.patient.archive_REAL",
        "risk": "R5",
        "category": "imuni_db",
        "mode": "real_patient_archive",
        "plugin_ready": True,
        "would_execute": True,
        "requires_confirmation": True,
        "requires_private_operator_credential": True,
        "required_confirmation": "R5_CONFIRMATION_AND_PRIVATE_OPERATOR_CREDENTIAL_REQUIRED",
        "description": "Arquiva paciente real por codigo. Nao faz hard delete.",
        "input_schema": {
            "type": "object",
            "properties": {
                "confirmacao": {"type": "string"},
                "operator_credential": {"type": "string"},
                "patient_code": {"type": "string"},
                "reason": {"type": "string"},
            },
            "required": ["confirmacao", "operator_credential", "patient_code"],
        },
    },
]


def is_patient_tool(tool: str) -> bool:
    return any(item["name"] == tool for item in PATIENT_TOOL_DEFINITIONS)


def _digits(value: Any) -> str:
    return "".join(ch for ch in str(value or "") if ch.isdigit())


def _sha(value: str | None) -> str | None:
    if not value:
        return None
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _lit(value: Any) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def _rows(stdout: str) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for raw in (stdout or "").split("\n---ROW---\n"):
        item: dict[str, str] = {}
        for line in raw.splitlines():
            line = "".join(ch for ch in line if ch == "\n" or ch == "\t" or ch.isprintable()).strip()
            if "=" in line:
                key, value = line.split("=", 1)
                item[key] = value
        if item:
            out.append(item)
    return out


def _blocked(tool: str, reason: str) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": reason,
        "would_execute": False,
        "executed": False,
        "clinical_data_persisted": False,
        "real_patient_data_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
    })


def _credential_ok(args: dict[str, Any]) -> bool:
    expected_hash = os.environ.get(_INTERNAL_CREDENTIAL_ENV, "").strip()
    supplied = str(args.get("operator_credential") or "")
    if not expected_hash or not supplied:
        return False
    actual_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual_hash, expected_hash)


def _gate(tool: str, args: dict[str, Any]) -> dict[str, Any] | None:
    if args.get("confirmacao") != _HUMAN_CONFIRMATION:
        return _blocked(tool, "human R5 confirmation required.")
    if not _credential_ok(args):
        return _blocked(tool, "internal server-side credential required.")
    return None


def _doctor_cte() -> str:
    return """
    doctor as (
      select p.id as practitioner_id, p.tenant_id
      from imuni.practitioners p
      join imuni.tenants t on t.id = p.tenant_id
      where t.slug = 'imuni-igor-private'
        and p.crm = '18700'
        and p.crm_uf = 'SC'
        and p.status = 'active'
      limit 1
    )
    """


def _run_sql(sql: str, timeout: int = 25) -> dict[str, Any]:
    return _docker_exec_fixed(
        "imuni-postgres",
        ["psql", "-U", "imuni_app", "-d", "imuni_clinical", "-v", "ON_ERROR_STOP=1", "-At", "-c", sql],
        timeout=timeout,
    )


def _create(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args):
        return blocked

    full_name = str(args.get("full_name") or "").strip()
    if len(full_name) < 2:
        return _blocked(tool, "full_name is required.")

    key = str(args["operator_credential"])
    cpf_hash = _sha(_digits(args.get("cpf")))
    phone = str(args.get("phone") or "").strip() or None
    phone_hash = _sha(_digits(phone))
    email = str(args.get("email") or "").strip().lower()
    email_hash = _sha(email)
    birth_date = str(args.get("birth_date") or "").strip() or None
    emergency = str(args.get("emergency_contact") or "").strip() or None

    sql = f"""
    with {_doctor_cte()},
    generated as (
      select 'IMUNI-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)) as patient_code
    ),
    patient as (
      insert into imuni.patients (
        tenant_id, patient_code, full_name_encrypted, cpf_hash, birth_date_encrypted,
        phone_encrypted, phone_hash, email_encrypted, email_hash, emergency_contact_encrypted,
        status, created_by
      )
      select
        doctor.tenant_id,
        generated.patient_code,
        encode(pgp_sym_encrypt({_lit(full_name)}, {_lit(key)}), 'base64'),
        {_lit(cpf_hash)},
        case when {_lit(birth_date)} is null then null else encode(pgp_sym_encrypt({_lit(birth_date)}, {_lit(key)}), 'base64') end,
        case when {_lit(phone)} is null then null else encode(pgp_sym_encrypt({_lit(phone)}, {_lit(key)}), 'base64') end,
        {_lit(phone_hash)},
        case when {_lit(email)} = '' then null else encode(pgp_sym_encrypt({_lit(email)}, {_lit(key)}), 'base64') end,
        {_lit(email_hash)},
        case when {_lit(emergency)} is null then null else encode(pgp_sym_encrypt({_lit(emergency)}, {_lit(key)}), 'base64') end,
        'active',
        doctor.practitioner_id
      from doctor, generated
      returning id, tenant_id, patient_code, status, created_by
    ),
    grant_admin as (
      insert into imuni.access_grants (tenant_id, practitioner_id, patient_id, scope, status, reason)
      select tenant_id, created_by, id, 'admin', 'active', 'patient.create_REAL' from patient
      on conflict (tenant_id, practitioner_id, patient_id, scope)
      do update set status='active', reason=excluded.reason, revoked_at=null
      returning id
    ),
    audit as (
      insert into imuni_audit.events (tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json)
      select tenant_id, created_by, 'physician_admin', 'patient.create_REAL', 'patient', id, encode(digest(id::text, 'sha256'), 'hex'),
        jsonb_build_object(
          'tool', 'imuni.patient.create_REAL',
          'raw_clinical_text', false,
          'cpf_raw_stored', false,
          'encrypted_fields', jsonb_build_array('full_name', 'birth_date', 'phone', 'email', 'emergency_contact')
        )
      from patient
      returning id
    )
    select
      'patient_id=' || id::text || chr(10) ||
      'tenant_id=' || tenant_id::text || chr(10) ||
      'patient_code=' || patient_code || chr(10) ||
      'status=' || status || chr(10) ||
      'created_by=' || created_by::text || chr(10) ||
      'access_grants_created=' || (select count(*)::text from grant_admin) || chr(10) ||
      'audit_events_created=' || (select count(*)::text from audit)
    from patient;
    """
    result = _run_sql(sql)
    fields = (_rows(result.get("stdout") or "") or [{ }])[0]
    ok = bool(result.get("ok") and fields.get("patient_id"))
    return base_result(tool, {
        "ok": ok,
        "would_execute": ok,
        "executed": ok,
        "database": "imuni_clinical",
        "patient": fields,
        "access_grants_created": fields.get("access_grants_created"),
        "audit_events_created": fields.get("audit_events_created"),
        "cpf_raw_stored": False,
        "encrypted_fields": ["full_name", "birth_date", "phone", "email", "emergency_contact"],
        "real_patient_data_persisted": ok,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not result.get("ok") else "",
    })


def _search(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args):
        return blocked

    code = str(args.get("patient_code") or "").strip()
    cpf_hash = _sha(_digits(args.get("cpf")))
    if not code and not cpf_hash:
        return _blocked(tool, "patient_code or cpf is required.")

    key = str(args["operator_credential"])
    limit = max(1, min(int(args.get("limit") or 10), 20))
    filters: list[str] = []
    if code:
        filters.append(f"p.patient_code = {_lit(code)}")
    if cpf_hash:
        filters.append(f"p.cpf_hash = {_lit(cpf_hash)}")
    where = " or ".join(filters)

    sql = f"""
    with {_doctor_cte()},
    matched as (
      select p.*
      from imuni.patients p, doctor
      where p.tenant_id = doctor.tenant_id
        and ({where})
      order by p.created_at desc
      limit {limit}
    ),
    audit as (
      insert into imuni_audit.events (
        tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json
      )
      select doctor.tenant_id, doctor.practitioner_id, 'physician_admin', 'patient.search_REAL', 'patient', null, null,
        jsonb_build_object('tool', 'imuni.patient.search_REAL', 'result_count', (select count(*) from matched), 'raw_clinical_text', false)
      from doctor
      returning id
    )
    select string_agg(
      'patient_id=' || id::text || chr(10) ||
      'tenant_id=' || tenant_id::text || chr(10) ||
      'patient_code=' || patient_code || chr(10) ||
      'full_name=' || convert_from(pgp_sym_decrypt(decode(full_name_encrypted, 'base64'), {_lit(key)}), 'utf8') || chr(10) ||
      'status=' || status || chr(10) ||
      'created_at=' || created_at::text || chr(10) ||
      'archived_at=' || coalesce(archived_at::text, '') || chr(10) || '---ROW---',
      chr(10)
    ) from matched;
    """
    result = _run_sql(sql)
    patients = _rows(result.get("stdout") or "")
    ok = bool(result.get("ok"))
    return base_result(tool, {
        "ok": ok,
        "would_execute": True,
        "executed": ok,
        "database": "imuni_clinical",
        "patients": patients,
        "count": len(patients),
        "real_patient_data_read": ok,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not result.get("ok") else "",
    })


def _archive(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if blocked := _gate(tool, args):
        return blocked

    code = str(args.get("patient_code") or "").strip()
    if not code:
        return _blocked(tool, "patient_code is required.")
    reason = str(args.get("reason") or "operator_request").strip()[:500]

    sql = f"""
    with {_doctor_cte()},
    archived as (
      update imuni.patients p
      set status = 'archived',
          archived_at = now(),
          updated_at = now()
      from doctor
      where p.tenant_id = doctor.tenant_id
        and p.patient_code = {_lit(code)}
        and p.status <> 'archived'
      returning p.id, p.tenant_id, p.patient_code, p.status, p.archived_at, doctor.practitioner_id
    ),
    audit as (
      insert into imuni_audit.events (tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json)
      select tenant_id, practitioner_id, 'physician_admin', 'patient.archive_REAL', 'patient', id, encode(digest(id::text, 'sha256'), 'hex'),
        jsonb_build_object('tool', 'imuni.patient.archive_REAL', 'reason', {_lit(reason)}, 'hard_delete', false, 'raw_clinical_text', false)
      from archived
      returning id
    )
    select
      'patient_id=' || id::text || chr(10) ||
      'tenant_id=' || tenant_id::text || chr(10) ||
      'patient_code=' || patient_code || chr(10) ||
      'status=' || status || chr(10) ||
      'archived_at=' || archived_at::text || chr(10) ||
      'audit_events_created=' || (select count(*)::text from audit)
    from archived;
    """
    result = _run_sql(sql)
    fields = (_rows(result.get("stdout") or "") or [{}])[0]
    ok = bool(result.get("ok") and fields.get("patient_id"))
    return base_result(tool, {
        "ok": ok,
        "would_execute": ok,
        "executed": ok,
        "database": "imuni_clinical",
        "patient": fields,
        "hard_delete": False,
        "real_patient_data_archived": ok,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not result.get("ok") else "",
    })


def call_patient_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.patient.create_REAL":
        return _create(tool, args)
    if tool == "imuni.patient.search_REAL":
        return _search(tool, args)
    if tool == "imuni.patient.archive_REAL":
        return _archive(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni patient tool", "would_execute": False}}
