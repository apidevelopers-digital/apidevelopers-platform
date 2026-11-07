from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

HUMAN_REVIEW_NOTICE = (
    "Ferramenta de apoio clínico assistido. Não substitui médico, não fecha diagnóstico, "
    "não prescreve autonomamente e exige revisão humana profissional."
)

RED_FLAGS = {
    "dor no peito": "dor torácica pode exigir avaliação urgente",
    "falta de ar": "dispneia pode exigir avaliação urgente",
    "confusão": "alteração do estado mental é sinal de alerta",
    "desmaio": "síncope pode exigir avaliação urgente",
    "convulsão": "convulsão é sinal de alerta",
    "sangramento intenso": "sangramento importante exige avaliação urgente",
    "rigidez de nuca": "pode indicar condição grave e requer avaliação",
    "febre persistente": "febre persistente requer avaliação clínica",
    "dor forte": "dor intensa requer avaliação clínica",
    "fraqueza de um lado": "déficit neurológico focal é sinal de alerta",
    "ideação suicida": "risco de autoagressão exige suporte imediato",
    "lábios roxos": "cianose é sinal de alerta",
}

IMUNI_TOOL_DEFINITIONS = [
    {"name": "imuni.status", "risk": "R1", "category": "imuni", "mode": "read", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Status seguro do produto Imuni.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "imuni.config.check", "risk": "R1", "category": "imuni", "mode": "read", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Conferência segura sem secrets.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "imuni.readiness.report", "risk": "R2", "category": "imuni", "mode": "dry-run/report", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Readiness clínico e operacional.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "imuni.clinical.boundary", "risk": "R1", "category": "imuni", "mode": "policy", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Limites clínicos do Imuni.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "imuni.encounter.draft", "risk": "R2", "category": "imuni", "mode": "draft_no_persist", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Rascunho de consulta sem persistência.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    {"name": "imuni.red_flags.check", "risk": "R2", "category": "imuni", "mode": "draft_no_persist", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Checagem de sinais de alerta com negação em português.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}, "age_group": {"type": "string"}}, "required": ["text"]}},
    {"name": "imuni.prescription.draft", "risk": "R3", "category": "imuni", "mode": "draft_human_review_required", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Rascunho bloqueado para revisão profissional.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}}, "required": ["text"]}},
    {"name": "imuni.audit.log", "risk": "R2", "category": "imuni", "mode": "read/report", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Auditoria operacional sem dados clínicos.", "input_schema": {"type": "object", "properties": {}}},
]


def _base(tool: str, result: dict[str, Any]) -> dict[str, Any]:
    result.setdefault("ok", True)
    result.setdefault("tool", tool)
    result.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
    result.setdefault("would_execute", False)
    result.setdefault("secret_value_exposed", False)
    result.setdefault("clinical_data_persisted", False)
    result.setdefault("human_review_required", True)
    result.setdefault("notice", HUMAN_REVIEW_NOTICE)
    return {"tool": tool, "result": result}


def _is_negated_term(lower_text: str, term: str) -> bool:
    idx = lower_text.find(term)
    if idx < 0:
        return False
    start = max(lower_text.rfind(".", 0, idx), lower_text.rfind(";", 0, idx), lower_text.rfind("\n", 0, idx)) + 1
    prefix = " " + lower_text[start:idx].strip() + " "
    markers = ("nega", "negou", "sem", "não apresenta", "nao apresenta", "não refere", "nao refere", "não relata", "nao relata", "ausência de", "ausencia de", "sem queixa de")
    for marker in markers:
        if f" {marker} " in prefix:
            if marker == "nega" and (" não nega " in prefix or " nao nega " in prefix):
                return False
            return True
    return False


def _red_flags_check(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text") or "").strip()
    if not text:
        return _base(tool, {"ok": False, "errors": ["text is required"]})
    lower = text.lower()
    detected, negated = [], []
    for term, reason in RED_FLAGS.items():
        if term not in lower:
            continue
        if _is_negated_term(lower, term):
            negated.append({"term": term, "reason": "explicitly negated in source text"})
        else:
            detected.append({"term": term, "reason": reason})
    return _base(tool, {
        "errors": [],
        "detected_red_flags": detected,
        "negated_red_flags": negated,
        "urgent_human_review_required": bool(detected),
        "age_group": args.get("age_group"),
        "orientation": "Se houver sinal de alerta não negado, procurar avaliação profissional/serviço de urgência conforme gravidade local.",
        "dry_run": True,
        "negation_patch_version": "v2",
    })


def call_imuni_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.red_flags.check":
        return _red_flags_check(tool, args)
    if tool == "imuni.clinical.boundary":
        return _base(tool, {"policy": {"default_mode": "draft_no_persist", "human_review_required": True, "not_allowed": ["diagnóstico autônomo", "prescrição autônoma", "persistência clínica sem governança"]}})
    if tool == "imuni.readiness.report":
        return _base(tool, {"dry_run": True, "readiness": {"mcp_tools": "active_v1", "privacy_governance": "active_v1", "clinical_writes": "blocked", "production_clinical_writes": "blocked"}, "governance": {"id": "imuni-governance-v1", "status": "active_v1", "effective_mode": "draft_no_persist"}})
    if tool == "imuni.status":
        return _base(tool, {"product": "Imuni", "mcp_namespace": "imuni", "mcp_tools_declared": [t["name"] for t in IMUNI_TOOL_DEFINITIONS], "production_writes_enabled": False, "clinical_writes_enabled": False})
    if tool == "imuni.config.check":
        return _base(tool, {"checks": {"risk_marked_sensitive": True}, "blocked_reads": [".env", "tokens", "secrets"], "env_read": False})
    if tool == "imuni.audit.log":
        return _base(tool, {"audit_scope": "operational_metadata_only", "clinical_payload_logged": False, "persisted_patient_record": False})
    if tool == "imuni.encounter.draft":
        text = str(args.get("text") or "").strip()
        return _base(tool, {"ok": bool(text), "errors": [] if text else ["text is required"], "draft": {"historia_atual": text, "hipoteses": "não gerar como certeza"}})
    if tool == "imuni.prescription.draft":
        return _base(tool, {"blocked_autonomous_prescription": True, "draft_type": "conduta_para_revisao_profissional"})
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni tool", "would_execute": False}}
