from __future__ import annotations

import json
import os
import socket
import urllib.error
import urllib.request
from typing import Any


JURI_DATAJUD_TOOL_NAMES = {
    "juri.datajud.status",
    "juri.datajud.smoke",
    "juri.datajud.request",
    "juri.datajud.job.get",
}


JURI_DATAJUD_TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "name": "juri.datajud.status",
        "description": "Verifica se a integração DataJud está configurada no runtime unico.sitedauni.com, via gateway jurídico validado.",
        "input_schema": {
            "type": "object",
            "properties": {
                "timeoutMs": {
                    "type": "integer",
                    "description": "Tempo máximo da chamada ao gateway em milissegundos.",
                    "default": 15000,
                    "minimum": 1000,
                    "maximum": 30000,
                }
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "juri.datajud.request",
        "description": "Cria uma consulta DataJud assíncrona por número CNJ e tribunal, retornando jobId/pollUrl para acompanhamento.",
        "input_schema": {
            "type": "object",
            "required": ["tribunalAlias", "cnjNumber"],
            "properties": {
                "tribunalAlias": {
                    "type": "string",
                    "description": "Alias do tribunal/DataJud. Ex.: trf1, tjsc, tst.",
                    "minLength": 2,
                },
                "cnjNumber": {
                    "type": "string",
                    "description": "Número CNJ normalizado ou com pontuação.",
                    "minLength": 8,
                },
                "timeoutMs": {
                    "type": "integer",
                    "description": "Timeout solicitado ao backend DataJud.",
                    "default": 30000,
                    "minimum": 1000,
                    "maximum": 60000,
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "juri.datajud.job.get",
        "description": "Consulta o status de um job DataJud assíncrono criado por juri.datajud.request.",
        "input_schema": {
            "type": "object",
            "required": ["jobId"],
            "properties": {
                "jobId": {
                    "type": "string",
                    "description": "ID do job retornado por juri.datajud.request.",
                    "minLength": 8,
                },
                "timeoutMs": {
                    "type": "integer",
                    "description": "Tempo máximo da chamada ao gateway em milissegundos.",
                    "default": 15000,
                    "minimum": 1000,
                    "maximum": 30000,
                },
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "juri.datajud.smoke",
        "description": "Executa smoke técnico síncrono DataJud. Uso diagnóstico; pode demorar, retornar timeout ou rate limit.",
        "input_schema": {
            "type": "object",
            "required": ["tribunalAlias", "cnjNumber"],
            "properties": {
                "tribunalAlias": {
                    "type": "string",
                    "description": "Alias do tribunal/DataJud. Ex.: trf1, tjsc, tst.",
                    "minLength": 2,
                },
                "cnjNumber": {
                    "type": "string",
                    "description": "Número CNJ normalizado ou com pontuação.",
                    "minLength": 8,
                },
                "timeoutMs": {
                    "type": "integer",
                    "description": "Timeout solicitado ao backend DataJud.",
                    "default": 30000,
                    "minimum": 1000,
                    "maximum": 60000,
                },
            },
            "additionalProperties": False,
        },
    },
]


def is_juri_datajud_tool(tool: str) -> bool:
    return tool in JURI_DATAJUD_TOOL_NAMES


def _gateway_base_url() -> str:
    raw = (
        os.getenv("ADA_JURI_GATEWAY_BASE_URL")
        or os.getenv("ADA_GATEWAY_BASE_URL")
        or "https://gateway.apidevelopers.digital"
    )
    return raw.strip().rstrip("/")


def _timeout_seconds(args: dict[str, Any], default_ms: int = 15000) -> float:
    try:
        timeout_ms = int(args.get("timeoutMs") or default_ms)
    except (TypeError, ValueError):
        timeout_ms = default_ms
    timeout_ms = max(1000, min(timeout_ms, 60000))
    return timeout_ms / 1000


def _error(tool: str, code: str, message: str, **extra: Any) -> dict[str, Any]:
    return {
        "tool": tool,
        "result": {
            "ok": False,
            "error": code,
            "message": message,
            "secretExposed": False,
            "rawResultIncluded": False,
            **extra,
        },
    }


def _require_string(args: dict[str, Any], field: str, tool: str) -> str | None:
    value = str(args.get(field) or "").strip()
    if not value:
        return None
    return value


def _safe_payload_for_tool(tool: str, args: dict[str, Any]) -> dict[str, Any] | dict[str, Any]:
    if tool == "juri.datajud.status":
        return {}

    if tool in {"juri.datajud.request", "juri.datajud.smoke"}:
        tribunal_alias = _require_string(args, "tribunalAlias", tool)
        cnj_number = _require_string(args, "cnjNumber", tool)
        if not tribunal_alias:
            return {"__error__": "tribunal_alias_required"}
        if not cnj_number:
            return {"__error__": "cnj_number_required"}
        return {
            "tribunalAlias": tribunal_alias,
            "cnjNumber": cnj_number,
            "timeoutMs": int(args.get("timeoutMs") or 30000),
        }

    if tool == "juri.datajud.job.get":
        job_id = _require_string(args, "jobId", tool)
        if not job_id:
            return {"__error__": "job_id_required"}
        return {
            "jobId": job_id,
            "timeoutMs": int(args.get("timeoutMs") or 15000),
        }

    return {"__error__": "unknown_juri_datajud_tool"}


def _post_gateway_call(tool: str, payload: dict[str, Any], timeout_seconds: float) -> dict[str, Any]:
    base_url = _gateway_base_url()
    body = {
        "operation": tool,
        "dry_run": True,
        "payload": payload,
    }
    data = json.dumps(body).encode("utf-8")
    request = urllib.request.Request(
        f"{base_url}/v1/plugins/juri/call",
        data=data,
        method="POST",
        headers={
            "content-type": "application/json",
            "accept": "application/json",
        },
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return {
                "tool": tool,
                "result": parsed,
                "httpStatus": response.status,
                "gateway": base_url,
                "dryRun": True,
                "secretExposed": False,
                "rawResultIncluded": False,
            }
    except urllib.error.HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        try:
            parsed = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            parsed = {"ok": False, "error": "gateway_non_json_error", "responseBytes": len(raw)}
        return {
            "tool": tool,
            "result": parsed,
            "httpStatus": error.code,
            "gateway": base_url,
            "dryRun": True,
            "secretExposed": False,
            "rawResultIncluded": False,
        }
    except (urllib.error.URLError, TimeoutError, socket.timeout) as error:
        return _error(
            tool,
            "gateway_unavailable",
            "Não foi possível chamar o gateway jurídico.",
            gateway=base_url,
            errorType=error.__class__.__name__,
        )


def call_juri_datajud_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}

    if not is_juri_datajud_tool(tool):
        return _error(tool, "unknown_juri_datajud_tool", "Ferramenta DataJud jurídica desconhecida.")

    payload = _safe_payload_for_tool(tool, args)
    if "__error__" in payload:
        return _error(tool, payload["__error__"], f"Campo obrigatório ausente para {tool}.")

    return _post_gateway_call(tool, payload, _timeout_seconds(args))
