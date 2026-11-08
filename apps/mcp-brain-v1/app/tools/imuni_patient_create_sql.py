
from __future__ import annotations

from typing import Any

from .imuni_base_tools import base_result
from .imuni_exec_utils import docker_exec_psql_stdin, parse_key_value_rows
from .imuni_r5_controls import (
    email_hmac_lookup,
    hmac_lookup,
    require_patient_write_controls,
)


def _lit(value: Any) -> str:
    if value is None:
        return "null"
    return "'" + str(value).replace("'", "''") + "'"


def _redacted_failure(tool: str, reason: str = "patient create SQL failed; diagnostics redacted.") -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": False,
        "reason": reason,
        "would_execute": True,
        "executed": False,
        "real_patient_data_persisted": False,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": "redacted",
    })


def create_patient_real(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    full_name = str(args.get("full_name") or "").strip()
    if len(full_name) < 2:
        return base_result(tool, {
            "ok": False,
            "blocked": True,
            "reason": "full_name is required.",
            "would_execute": False,
            "executed": False,
            "real_patient_data_persisted": False,
            "secret_value_exposed": False,
            "dsn_exposed": False,
        })

    controls_ok, controls_or_reason = require_patient_write_controls(args)
    if not controls_ok:
        return base_result(tool, {
            "ok": False,
            "blocked": True,
            "reason": controls_or_reason,
            "would_execute": False,
            "executed": False,
            "real_patient_data_persisted": False,
            "secret_value_exposed": False,
            "dsn_exposed": False,
        })

    controls = controls_or_reason
    cpf_hmac = hmac_lookup(args.get("cpf"), controls.lookup_hmac_key)
    phone = str(args.get("phone") or "").strip() or None
    phone_hmac = hmac_lookup(phone, controls.lookup_hmac_key)
    email = str(args.get("email") or "").strip().lower()
    email_hmac = email_hmac_lookup(email, controls.lookup_hmac_key)
    birth_date = str(args.get("birth_date") or "").strip() or None
    emergency_contact = str(args.get("emergency_contact") or "").strip() or None

    sql = f"""
with doctor as (
  select p.id as practitioner_id, p.tenant_id
  from imuni.practitioners p
  join imuni.tenants t on t.id = p.tenant_id
  where t.slug = 'imuni-igor-private'
    and p.crm = '18700'
    and p.crm_uf = 'SC'
    and p.status = 'active'
  limit 1
), app_context as (
  select
    set_config('imuni.tenant_id', doctor.tenant_id::text, true) as tenant_ctx,
    set_config('imuni.practitioner_id', doctor.practitioner_id::text, true) as practitioner_ctx
  from doctor
), generated as (
  select 'IMUNI-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(encode(gen_random_bytes(4), 'hex'), 1, 8)) as patient_code
  from app_context
), patient as (
  insert into imuni.patients (
    tenant_id, patient_code, full_name_encrypted, cpf_hash, birth_date_encrypted,
    phone_encrypted, phone_hash, email_encrypted, email_hash, emergency_contact_encrypted,
    status, created_by
  )
  select
    doctor.tenant_id,
    generated.patient_code,
    encode(pgp_sym_encrypt({_lit(full_name)}, {_lit(controls.encryption_key)}), 'base64'),
    {_lit(cpf_hmac)},
    case when {_lit(birth_date)} is null then null else encode(pgp_sym_encrypt({_lit(birth_date)}, {_lit(controls.encryption_key)}), 'base64') end,
    case when {_lit(phone)} is null then null else encode(pgp_sym_encrypt({_lit(phone)}, {_lit(controls.encryption_key)}), 'base64') end,
    {_lit(phone_hmac)},
    case when {_lit(email)} = '' then null else encode(pgp_sym_encrypt({_lit(email)}, {_lit(controls.encryption_key)}), 'base64') end,
    {_lit(email_hmac)},
    case when {_lit(emergency_contact)} is null then null else encode(pgp_sym_encrypt({_lit(emergency_contact)}, {_lit(controls.encryption_key)}), 'base64') end,
    'active',
    doctor.practitioner_id
  from doctor, generated, app_context
  returning id, tenant_id, patient_code, status, created_by
), grant_admin as (
  insert into imuni.access_grants (tenant_id, practitioner_id, patient_id, scope, status, reason)
  select tenant_id, created_by, id, 'admin', 'active', 'patient.create_REAL' from patient
  on conflict (tenant_id, practitioner_id, patient_id, scope)
  do update set status='active', reason=excluded.reason, revoked_at=null
  returning id
), audit as (
  insert into imuni_audit.events (
    tenant_id, actor_id, actor_role, action, resource_type, resource_id, patient_id_hash, metadata_json
  )
  select
    tenant_id,
    created_by,
    'physician_admin',
    'patient.create_REAL',
    'patient',
    id,
    encode(digest(id::text, 'sha256'), 'hex'),
    jsonb_build_object(
      'tool', 'imuni.patient.create_REAL',
      'cpf_raw_stored', false,
      'lookup_hmac_key_id', {_lit(controls.lookup_hmac_key_id)},
      'encryption_key_id', {_lit(controls.encryption_key_id)},
      'encrypted_fields', jsonb_build_array('full_name','birth_date','phone','email','emergency_contact')
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

    result = docker_exec_psql_stdin(
        container="imuni-postgres",
        database="imuni_clinical",
        user="imuni_app",
        sql=sql,
        timeout=30,
    )
    rows = parse_key_value_rows(result.get("stdout") or "")
    fields = rows[0] if rows else {}
    ok = bool(result.get("ok") and fields.get("patient_id"))

    if not ok:
        return _redacted_failure(tool)

    return base_result(tool, {
        "ok": True,
        "would_execute": True,
        "executed": True,
        "database": "imuni_clinical",
        "patient": fields,
        "access_grants_created": fields.get("access_grants_created"),
        "audit_events_created": fields.get("audit_events_created"),
        "cpf_raw_stored": False,
        "lookup_hmac_used": True,
        "lookup_hmac_key_id": controls.lookup_hmac_key_id,
        "encryption_key_id": controls.encryption_key_id,
        "encrypted_fields": ["full_name", "birth_date", "phone", "email", "emergency_contact"],
        "real_patient_data_persisted": True,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": "",
    })
