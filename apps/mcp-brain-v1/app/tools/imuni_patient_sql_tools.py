from __future__ import annotations

import hashlib
import re
from typing import Any

from .imuni_base_tools import base_result
from .imuni_psql_file_transport import psql_file_imuni

_CONFIRM = "IGOR_APROVA_R5_IMUNI_PATIENT_SEARCH_READONLY_V1"
_PATIENT_CODE_RE = re.compile(r"^[A-Z0-9][A-Z0-9_-]{2,79}$")


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


def _cpf_hash(value: Any) -> str:
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return hashlib.sha256(digits.encode("utf-8")).hexdigest() if digits else ""


def _sql_literal(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def _safe_limit(value: Any, default: int = 10) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(1, min(parsed, 20))


def _search_patient(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("confirmacao") != _CONFIRM:
        return _blocked(tool, "human R5 readonly search confirmation required.")

    patient_code = str(args.get("patient_code") or "").strip().upper()
    cpf_hash = _cpf_hash(args.get("cpf"))
    if not patient_code and not cpf_hash:
        return _blocked(tool, "patient_code or cpf is required.")
    if patient_code and not _PATIENT_CODE_RE.fullmatch(patient_code):
        return _blocked(tool, "patient_code has invalid format.")

    filters: list[str] = []
    if patient_code:
        filters.append(f"p.patient_code = {_sql_literal(patient_code)}")
    if cpf_hash:
        filters.append(f"p.cpf_hash = {_sql_literal(cpf_hash)}")

    sql = f"""
with ctx as (
  select id as tenant_id
  from imuni.tenants
  where slug = 'imuni-igor-private' and status = 'active'
  limit 1
)
select
  'patient_code=' || p.patient_code || chr(9) ||
  'status=' || p.status || chr(9) ||
  'created_at=' || p.created_at::text || chr(9) ||
  'archived_at=' || coalesce(p.archived_at::text, '')
from imuni.patients p, ctx
where p.tenant_id = ctx.tenant_id
  and ({' or '.join(filters)})
order by p.created_at desc
limit {_safe_limit(args.get("limit"))};
"""
    result = psql_file_imuni(sql, variables=None, timeout=25)
    rows: list[dict[str, str]] = []
    for line in (result.get("stdout") or "").splitlines():
        row: dict[str, str] = {}
        for part in line.split("\t"):
            if "=" in part:
                key, value = part.split("=", 1)
                row[key] = value
        if row:
            rows.append(row)

    ok = bool(result.get("ok"))
    return base_result(tool, {
        "ok": ok,
        "executed": ok,
        "would_execute": ok,
        "count": len(rows),
        "patients": rows,
        "clinical_data_persisted": False,
        "clinical_payload_persisted": False,
        "real_patient_data_persisted": False,
        "raw_patient_data_returned": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "diagnostic_error_tail": result.get("stderr_tail") if not ok else "",
    })


def call_patient_sql_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.patient.search_REAL":
        return _search_patient(tool, args)
    return _blocked(tool, "real patient mutation remains blocked; only readonly search is implemented.")
