from __future__ import annotations
from typing import Any
from .imuni_base_tools import base_result

EXPECTED_TABLES = {
    "imuni.access_grants","imuni.attachments","imuni.clinical_notes","imuni.encounters",
    "imuni.patient_consents","imuni.patients","imuni.practitioners","imuni.tenants","imuni_audit.events",
}
SYNTHETIC_COUNT_KEYS = ("tenants","practitioners","patients","encounters","audit_events")
DB_TOOL_DEFINITIONS = [
    {"name":"imuni.db.status","risk":"R1","category":"imuni_db","mode":"read","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Status seguro do PostgreSQL clínico Imuni staging/dev, sem expor senha ou DSN.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.db.schema.check","risk":"R1","category":"imuni_db","mode":"read","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Checagem read-only do schema PostgreSQL Imuni staging/dev com queries fixas.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.db.synthetic.counts","risk":"R1","category":"imuni_db","mode":"read","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Conta registros sintéticos de staging sem expor payload clínico ou segredo.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.db.synthetic.seed","risk":"R5","category":"imuni_db","mode":"staging_only_synthetic_write","plugin_ready":True,"would_execute":True,"requires_confirmation":True,"required_confirmation":"IGOR_APROVA_R5","description":"Cria dados sintéticos de teste no PostgreSQL Imuni staging/dev. Bloqueia dados reais.","input_schema":{"type":"object","properties":{"synthetic_ack":{"type":"boolean"},"confirmacao":{"type":"string"},"note":{"type":"string"}},"required":["synthetic_ack","confirmacao"]}},
]

def is_db_tool(tool: str) -> bool:
    return any(t["name"] == tool for t in DB_TOOL_DEFINITIONS)

def clean_docker_exec_lines(text: str) -> list[str]:
    cleaned: list[str] = []
    for raw in (text or "").splitlines():
        line = "".join(ch for ch in raw if ch.isprintable()).strip()
        for marker in ("imuni.", "imuni_audit."):
            pos = line.find(marker)
            if pos >= 0:
                line = line[pos:]
                break
        if line:
            cleaned.append(line)
    return cleaned

def clean_key_value_count_line(line: str) -> tuple[str, int] | None:
    line = "".join(ch for ch in (line or "") if ch.isprintable()).strip()
    for key in SYNTHETIC_COUNT_KEYS:
        marker = key + "="
        pos = line.find(marker)
        if pos >= 0:
            try:
                return key, int(line[pos + len(marker):])
            except Exception:
                return key, 0
    return None

def _status(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": "source-control draft: live Docker socket diagnostics remain enabled only on VPS runtime until deploy workflow is reviewed",
        "database": "imuni_clinical",
        "environment": "staging_dev",
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "read_only": True,
    })

def _schema_check(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": "source-control draft: schema check needs runtime Docker socket; helper parsers are tested here",
        "tables_expected_count": len(EXPECTED_TABLES),
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "read_only": True,
        "stream_clean_patch_version": "v3",
    })

def _synthetic_counts(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": "source-control draft: synthetic counts need staging Postgres runtime",
        "synthetic_counts": {},
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "clinical_payload_exposed": False,
        "read_only": True,
        "stream_clean_patch_version": "synthetic-counts-v2",
    })

def _synthetic_seed(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("synthetic_ack") is not True:
        return base_result(tool, {"ok":False,"blocked":True,"reason":"synthetic_ack=true is required. Real patient data is not allowed.","would_execute":False,"clinical_data_persisted":False})
    if args.get("confirmacao") != "IGOR_APROVA_R5":
        return base_result(tool, {"ok":False,"blocked":True,"reason":"IGOR_APROVA_R5 confirmation required for staging synthetic write.","would_execute":False,"clinical_data_persisted":False})
    return base_result(tool, {
        "ok": False,
        "blocked": True,
        "reason": "source-control draft: real synthetic seed execution remains implemented only in verified VPS runtime until deploy workflow is reviewed",
        "synthetic_only": True,
        "real_patient_data_allowed": False,
        "clinical_writes_enabled": False,
        "production_writes_enabled": False,
        "secret_value_exposed": False,
        "dsn_exposed": False,
        "clinical_payload_exposed": False,
    })

def call_db_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.db.status":
        return _status(tool, args)
    if tool == "imuni.db.schema.check":
        return _schema_check(tool, args)
    if tool == "imuni.db.synthetic.counts":
        return _synthetic_counts(tool, args)
    if tool == "imuni.db.synthetic.seed":
        return _synthetic_seed(tool, args)
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni db tool", "would_execute": False}}
