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
}
BASE_TOOL_DEFINITIONS = [
    {"name":"imuni.status","risk":"R1","category":"imuni","mode":"read","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Status seguro do produto Imuni.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.config.check","risk":"R1","category":"imuni","mode":"read","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Conferência segura sem secrets.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.readiness.report","risk":"R2","category":"imuni","mode":"dry-run/report","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Readiness clínico e privacidade.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.clinical.boundary","risk":"R1","category":"imuni","mode":"policy","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Limites clínicos do Imuni.","input_schema":{"type":"object","properties":{}}},
    {"name":"imuni.encounter.draft","risk":"R2","category":"imuni","mode":"draft_no_persist","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Rascunho sem persistência.","input_schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}},
    {"name":"imuni.red_flags.check","risk":"R2","category":"imuni","mode":"draft_no_persist","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Checa sinais de alerta com negação simples em português.","input_schema":{"type":"object","properties":{"text":{"type":"string"},"age_group":{"type":"string"}},"required":["text"]}},
    {"name":"imuni.prescription.draft","risk":"R3","category":"imuni","mode":"draft_human_review_required","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Rascunho para revisão profissional.","input_schema":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"]}},
    {"name":"imuni.audit.log","risk":"R2","category":"imuni","mode":"read/report","plugin_ready":True,"would_execute":False,"requires_confirmation":False,"description":"Auditoria operacional sem payload clínico.","input_schema":{"type":"object","properties":{}}},
]

def base_result(tool: str, result: dict[str, Any]) -> dict[str, Any]:
    result.setdefault("ok", True)
    result.setdefault("tool", tool)
    result.setdefault("generated_at", datetime.now(timezone.utc).isoformat())
    result.setdefault("would_execute", False)
    result.setdefault("secret_value_exposed", False)
    result.setdefault("clinical_data_persisted", False)
    result.setdefault("human_review_required", True)
    result.setdefault("notice", HUMAN_REVIEW_NOTICE)
    return {"tool": tool, "result": result}

def is_base_tool(tool: str) -> bool:
    return any(t["name"] == tool for t in BASE_TOOL_DEFINITIONS)

def _is_negated(lower: str, term: str) -> bool:
    idx = lower.find(term)
    if idx < 0:
        return False
    start = max(lower.rfind(".", 0, idx), lower.rfind(";", 0, idx), lower.rfind("\n", 0, idx)) + 1
    prefix = " " + lower[start:idx].strip() + " "
    markers = ("nega","negou","sem","não apresenta","nao apresenta","não refere","nao refere","não relata","nao relata","ausência de","ausencia de","sem queixa de")
    return any(f" {m} " in prefix for m in markers) and " não nega " not in prefix and " nao nega " not in prefix

def _red_flags(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text") or "").strip()
    if not text:
        return base_result(tool, {"ok": False, "errors": ["text is required"]})
    lower = text.lower()
    detected, negated = [], []
    for term, reason in RED_FLAGS.items():
        if term not in lower:
            continue
        if _is_negated(lower, term):
            negated.append({"term": term, "reason": "explicitly negated in source text"})
        else:
            detected.append({"term": term, "reason": reason})
    return base_result(tool, {"errors":[],"detected_red_flags":detected,"negated_red_flags":negated,"urgent_human_review_required":bool(detected),"age_group":args.get("age_group"),"dry_run":True,"negation_patch_version":"v2"})

def call_base_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.red_flags.check":
        return _red_flags(tool, args)
    if tool == "imuni.status":
        return base_result(tool, {"product":"Imuni","mcp_namespace":"imuni","clinical_writes_enabled":False,"production_writes_enabled":False})
    if tool == "imuni.config.check":
        return base_result(tool, {"checks":{"risk_marked_sensitive":True},"blocked_reads":[".env","tokens","secrets"],"env_read":False})
    if tool == "imuni.readiness.report":
        return base_result(tool, {"dry_run":True,"readiness":{"registry":"active_v1","mcp_tools":"active_v1","clinical_boundary":"active_v1","privacy_governance":"active_v1","clinical_writes":"blocked","production_clinical_writes":"blocked"},"governance":{"id":"imuni-governance-v1","status":"active_v1","effective_mode":"draft_no_persist"}})
    if tool == "imuni.clinical.boundary":
        return base_result(tool, {"policy":{"default_mode":"draft_no_persist","human_review_required":True,"not_allowed":["diagnóstico autônomo","prescrição autônoma","persistência clínica sem governança"]}})
    if tool == "imuni.encounter.draft":
        text = str(args.get("text") or "").strip()
        return base_result(tool, {"ok": bool(text), "errors": [] if text else ["text is required"], "draft": {"historia_atual": text}})
    if tool == "imuni.prescription.draft":
        return base_result(tool, {"blocked_autonomous_prescription": True, "draft_type": "conduta_para_revisao_profissional"})
    if tool == "imuni.audit.log":
        return base_result(tool, {"audit_scope": "operational_metadata_only", "clinical_payload_logged": False})
    return {"tool": tool, "result": {"ok": False, "error": "unknown imuni base tool", "would_execute": False}}
