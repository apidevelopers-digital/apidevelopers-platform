from __future__ import annotations

import hashlib
import hmac
import os
from typing import Any

from .imuni_base_tools import base_result

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
        "description": "Cria paciente real no Imuni com gate R5, credencial interna e auditoria.",
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
        "description": "Busca paciente real por codigo ou CPF com gate R5 e credencial interna.",
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


def _credential_ok(args: dict[str, Any]) -> bool:
    expected_hash = os.environ.get(_INTERNAL_CREDENTIAL_ENV, "").strip()
    supplied = str(args.get("operator_credential") or "")
    if not expected_hash or not supplied:
        return False
    actual_hash = hashlib.sha256(supplied.encode("utf-8")).hexdigest()
    return hmac.compare_digest(actual_hash, expected_hash)


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


def _gate(tool: str, args: dict[str, Any]) -> dict[str, Any] | None:
    if args.get("confirmacao") != _HUMAN_CONFIRMATION:
        return _blocked(tool, "human R5 confirmation required.")
    if not _credential_ok(args):
        return _blocked(tool, "internal server-side credential required.")
    return None


def _not_enabled_yet(tool: str) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": "patient REAL operation is declared and gated; SQL execution is intentionally pending a follow-up reviewed implementation.",
        "would_execute": False,
        "executed": False,
        "real_patient_data_persisted": False,
        "clinical_payload_persisted": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
    })


def call_patient_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool in {"imuni.patient.create_REAL", "imuni.patient.search_REAL", "imuni.patient.archive_REAL"}:
        if blocked := _gate(tool, args):
            return blocked
        return _not_enabled_yet(tool)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni patient tool", "would_execute": False}}
