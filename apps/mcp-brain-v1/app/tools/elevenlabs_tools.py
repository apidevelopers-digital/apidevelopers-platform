from __future__ import annotations

import hashlib
import os
from datetime import datetime, timezone
from typing import Any

TTS_CONFIRMATION = "IGOR_APROVA_ELEVENLABS_TTS_REAL"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"

ELEVENLABS_TOOL_DEFINITIONS = [
    {"name": "elevenlabs.config.check", "risk": "R1", "category": "media/tts", "mode": "read", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Confere ElevenLabs sem expor chave.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "elevenlabs.models.list", "risk": "R1", "category": "media/tts", "mode": "read/api", "plugin_ready": False, "would_execute": False, "requires_confirmation": False, "description": "Scaffold seguro para listar modelos ElevenLabs após validação runtime.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "elevenlabs.voices.list", "risk": "R1", "category": "media/tts", "mode": "read/api", "plugin_ready": False, "would_execute": False, "requires_confirmation": False, "description": "Scaffold seguro para listar vozes ElevenLabs após validação runtime.", "input_schema": {"type": "object", "properties": {"limit": {"type": "integer"}, "query": {"type": "string"}}}},
    {"name": "elevenlabs.tts.estimate", "risk": "R2", "category": "media/tts", "mode": "dry-run/estimate", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Estima caracteres e custo aproximado antes de gerar áudio.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}, "model_id": {"type": "string"}}, "required": ["text"]}},
    {"name": "elevenlabs.tts.test", "risk": "R4", "category": "media/tts", "mode": "paid-api/write-file", "plugin_ready": False, "would_execute": True, "requires_confirmation": True, "description": "Bloqueado até validação runtime completa.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}, "voice_id": {"type": "string"}, "output_path": {"type": "string"}, "confirmacao": {"type": "string"}}, "required": ["text", "voice_id", "output_path", "confirmacao"]}},
]


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _wrap(tool: str, result: dict[str, Any]) -> dict[str, Any]:
    result.setdefault("ok", True)
    result.setdefault("tool", tool)
    result.setdefault("generated_at", _now())
    result.setdefault("secret_value_exposed", False)
    return {"tool": tool, "result": result}


def is_elevenlabs_tool(tool: str) -> bool:
    return any(item["name"] == tool for item in ELEVENLABS_TOOL_DEFINITIONS)


def _secret_status() -> dict[str, Any]:
    value = os.environ.get("ELEVENLABS_API_KEY", "")
    return {
        "configured": len(value) >= 20,
        "source": "env",
        "sha1_prefix": hashlib.sha1(value.encode()).hexdigest()[:10] if value else None,
        "key_not_returned": True,
    }


def _estimate(text: str, model_id: str | None = None) -> dict[str, Any]:
    chars = len(text)
    model = model_id or DEFAULT_MODEL_ID
    rate = 0.04 if any(token in model.lower() for token in ("turbo", "flash")) else 0.08
    return {
        "dry_run": True,
        "characters": chars,
        "model_id": model,
        "estimated_usd_per_1000_chars": rate,
        "estimated_usd": round(chars / 1000 * rate, 4),
        "billing_note": "Estimate only. ElevenLabs workspace billing is the source of truth.",
    }


def call_elevenlabs_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}

    if tool == "elevenlabs.config.check":
        return _wrap(tool, {
            "integration": "elevenlabs",
            "secret_status": _secret_status(),
            "requires_confirmation_for_tts": True,
            "tts_confirmation_literal": TTS_CONFIRMATION,
        })

    if tool == "elevenlabs.tts.estimate":
        text = str(args.get("text") or "").strip()
        if not text:
            return _wrap(tool, {"ok": False, "error": "text is required"})
        return _wrap(tool, _estimate(text, str(args.get("model_id") or DEFAULT_MODEL_ID)))

    if tool in {"elevenlabs.models.list", "elevenlabs.voices.list"}:
        return _wrap(tool, {
            "ok": False,
            "blocked": "runtime_http_validation_pending",
            "would_execute": False,
            "credits_used": "none",
        })

    if tool == "elevenlabs.tts.test":
        return _wrap(tool, {
            "ok": False,
            "blocked": "runtime_validation_pending",
            "required_confirmacao": TTS_CONFIRMATION,
            "would_execute": True,
            "credits_used": "none",
        })

    return {"tool": tool, "result": {"ok": False, "error": "unknown elevenlabs tool", "would_execute": False}}
