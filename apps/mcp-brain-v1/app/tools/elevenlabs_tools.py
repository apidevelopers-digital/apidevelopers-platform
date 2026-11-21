
from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any



ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_TIMEOUT_SECONDS = 45
MAX_TTS_CHARS = 5000

ELEVENLABS_TOOL_DEFINITIONS = [
    {
        "name": "elevenlabs.config.check",
        "risk": "R1",
        "category": "media/tts",
        "mode": "read",
        "plugin_ready": True,
        "would_execute": False,
        "requires_confirmation": False,
        "description": "Confere se a integração ElevenLabs está configurada sem expor a API key.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "elevenlabs.models.list",
        "risk": "R1",
        "category": "media/tts",
        "mode": "read/api",
        "plugin_ready": True,
        "would_execute": False,
        "requires_confirmation": False,
        "description": "Lista modelos ElevenLabs disponíveis. Não gera áudio.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "elevenlabs.voices.list",
        "risk": "R1",
        "category": "media/tts",
        "mode": "read/api",
        "plugin_ready": True,
        "would_execute": False,
        "requires_confirmation": False,
        "description": "Lista vozes ElevenLabs disponíveis com metadados seguros. Não gera áudio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "limit": {"type": "integer", "minimum": 1, "maximum": 100},
                "query": {"type": "string"},
                "use_case": {"type": "string"},
                "language": {"type": "string"},
            },
        },
    },
    {
        "name": "elevenlabs.tts.estimate",
        "risk": "R2",
        "category": "media/tts",
        "mode": "dry-run/estimate",
        "plugin_ready": True,
        "would_execute": False,
        "requires_confirmation": False,
        "description": "Estima caracteres e custo aproximado antes de gerar áudio.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "model_id": {"type": "string"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "elevenlabs.tts.test",
        "risk": "R4",
        "category": "media/tts",
        "mode": "paid-api/write-file",
        "plugin_ready": True,
        "would_execute": True,
        "requires_confirmation": True,
        "description": "Gera um único MP3 de teste via ElevenLabs. Usa créditos externos e exige confirmação.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string"},
                "voice_id": {"type": "string"},
                "model_id": {"type": "string"},
                "output_path": {"type": "string"},
                "output_format": {"type": "string"},
                "confirmacao": {"type": "string"},
            },
            "required": ["text", "voice_id", "output_path", "confirmacao"],
        },
    },
]

# Confirmation is intentionally distinct from R5 deploy/merge confirmations.
TTS_CONFIRMATION = "IGOR_APROVA_ELEVENLABS_TTS_REAL"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _base_result(tool: str, result: dict[str, Any]) -> dict[str, Any]:
    result.setdefault("ok", True)
    result.setdefault("tool", tool)
    result.setdefault("generated_at", _now())
    result.setdefault("secret_value_exposed", False)
    return {"tool": tool, "result": result}


def is_elevenlabs_tool(tool: str) -> bool:
    return any(t["name"] == tool for t in ELEVENLABS_TOOL_DEFINITIONS)


def _secret_status() -> dict[str, Any]:
    value = os.environ.get("ELEVENLABS_API_KEY", "")
    return {
        "configured": len(value) >= 20,
        "source": "env",
        "sha1_prefix": hashlib.sha1(value.encode()).hexdigest()[:10] if value else None,
        "key_not_returned": True,
    }


def _api_key() -> str:
    value = os.environ.get("ELEVENLABS_API_KEY", "")
    if len(value) < 20:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured in environment")
    return value


def _request_json(path: str, *, method: str = "GET", body: dict[str, Any] | None = None, timeout: int = DEFAULT_TIMEOUT_SECONDS) -> Any:
    data = None
    headers = {
        "Accept": "application/json",
        "xi-api-key": _api_key(),
    }
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = urllib.request.Request(
        ELEVENLABS_API_BASE + path,
        data=data,
        headers=headers,
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read()
            if not raw:
                return {}
            return json.loads(raw.decode("utf-8"))
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ElevenLabs API error {exc.code}: {raw[:500]}") from exc


def _request_bytes(path: str, *, method: str = "POST", body: dict[str, Any], timeout: int = DEFAULT_TIMEOUT_SECONDS) -> bytes:
    data = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(
        ELEVENLABS_API_BASE + path,
        data=data,
        headers={
            "Accept": "audio/mpeg",
            "Content-Type": "application/json",
            "xi-api-key": _api_key(),
        },
        method=method,
    )

    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ElevenLabs TTS API error {exc.code}: {raw[:500]}") from exc


def _sanitize_voice(v: dict[str, Any]) -> dict[str, Any]:
    labels = v.get("labels") if isinstance(v.get("labels"), dict) else {}
    return {
        "name": v.get("name"),
        "voice_id": v.get("voice_id"),
        "category": v.get("category"),
        "description": v.get("description"),
        "preview_url_present": bool(v.get("preview_url")),
        "labels": {
            "accent": labels.get("accent"),
            "description": labels.get("description"),
            "age": labels.get("age"),
            "gender": labels.get("gender"),
            "use_case": labels.get("use_case"),
            "locale": labels.get("locale"),
            "language": labels.get("language"),
        }
    }


def _rank_voice(v: dict[str, Any]) -> int:
    text = json.dumps(v, ensure_ascii=False).lower()
    score = 0
    for keyword in (
        "narration",
        "narrative",
        "story",
        "storytelling",
        "audiobook",
        "documentary",
        "calm",
        "deep",
        "professional",
        "adult",
        "middle aged",
        "portuguese",
        "brazil",
        "brasil",
    ):
        if keyword in text:
            score += 2
    return score


def _safe_output_path(path: str) -> Path:
    if not path or "\x00" in path:
        raise ValueError("invalid output_path")
    normalized = Path(path)
    if normalized.is_absolute():
        allowed_roots = ("/tmp/", "/mnt/data/", "/opt/api-dev-brain/", "/home/")
        if not any(str(normalized).startswith(root) for root in allowed_roots):
            raise ValueError("output_path outside allowed roots")
        return normalized
    base = Path("/tmp/ada-elevenlabs")
    return base / normalized


def _estimate_cost(text: str, model_id: str) -> dict[str, Any]:
    chars = len(text)
    # Public pricing changes; keep this as an operational estimate, not billing truth.
    lower_model = (model_id or "").lower()
    usd_per_1000 = 0.04 if ("turbo" in lower_model or "flash" in lower_model) else 0.08
    return {
        "characters": chars,
        "model_id": model_id or DEFAULT_MODEL_ID,
        "estimated_usd_per_1000_chars": usd_per_1000,
        "estimated_usd": round(chars / 1000 * usd_per_1000, 4),
        "billing_note": "Estimate only. ElevenLabs workspace billing is the source of truth.",
    }


def _config_check(tool: str) -> dict[str, Any]:
    return _base_result(tool, {
        "integration": "elevenlabs",
        "secret_status": _secret_status(),
        "api_base": ELEVENLABS_API_BASE,
        "audio_generation_enabled": True,
        "requires_confirmation_for_tts": True,
        "tts_confirmation_literal": TTS_CONFIRMATION,
    })


def _models_list(tool: str) -> dict[str, Any]:
    payload = _request_json("/models")
    models = payload if isinstance(payload, list) else []
    safe = []
    for model in models:
        safe.append({
            "model_id": model.get("model_id"),
            "name": model.get("name"),
            "can_do_text_to_speech": model.get("can_do_text_to_speech"),
            "can_do_voice_conversion": model.get("can_do_voice_conversion"),
            "languages": (model.get("languages") or [])[:20],
        })
    return _base_result(tool, {
        "models_count": len(safe),
        "models": safe,
        "credits_used": "none_expected_metadata_only",
    })


def _voices_list(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    payload = _request_json("/voices")
    voices = payload.get("voices") if isinstance(payload, dict) else []
    query = str(args.get("query") or "").strip().lower()
    use_case = str(args.get("use_case") or "").strip().lower()
    language = str(args.get("language") or "").strip().lower()
    limit = int(args.get("limit") or 15)
    limit = max(1, min(100, limit))

    sanitized = [_sanitize_voice(v) for v in voices if isinstance(v, dict)]
    if query:
        sanitized = [v for v in sanitized if query in json.dumps(v, ensure_ascii=False).lower()]
    if use_case:
        sanitized = [v for v in sanitized if use_case in json.dumps(v.get("labels", {}), ensure_ascii=False).lower()]
    if language:
        sanitized = [v for v in sanitized if language in json.dumps(v.get("labels", {}), ensure_ascii=False).lower()]

    ranked = sorted(sanitized, key=_rank_voice, reverse=True)
    return _base_result(tool, {
        "voices_count": len(sanitized),
        "returned": min(limit, len(ranked)),
        "recommended_voice_candidates": ranked[:limit],
        "credits_used": "none_expected_metadata_only",
    })


def _tts_estimate(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text") or "").strip()
    model_id = str(args.get("model_id") or DEFAULT_MODEL_ID)
    if not text:
        return _base_result(tool, {"ok": False, "error": "text is required"})
    return _base_result(tool, {
        "dry_run": True,
        **_estimate_cost(text, model_id),
    })


def _tts_test(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("confirmacao") != TTS_CONFIRMATION:
        return _base_result(tool, {
            "ok": False,
            "error": "confirmation_required",
            "required_confirmacao": TTS_CONFIRMATION,
            "would_execute": True,
        })

    text = str(args.get("text") or "").strip()
    voice_id = str(args.get("voice_id") or "").strip()
    model_id = str(args.get("model_id") or DEFAULT_MODEL_ID)
    output_format = str(args.get("output_format") or DEFAULT_OUTPUT_FORMAT)
    output_path = str(args.get("output_path") or "").strip()

    errors = []
    if not text:
        errors.append("text is required")
    if len(text) > MAX_TS_CHARS:
        errors.append(f"text exceeds {MAX_TTS_CHARS} characters")
    if not voice_id:
        errors.append("voice_id is required")
    if not output_path:
        errors.append("output_path is required")
    if errors:
        return _base_result(tool, {"ok": False, "errors": errors})

    body = {
        "text": text,
        "model_id": model_id,
        "output_format": output_format,
        "voice_settings": {
            "stability": 0.55,
            "similarity_boost": 0.75,
            "style": 0.25,
            "use_speaker_boost": True,
        },
    }

    started = time.time()
    audio = _request_bytes(f"/text-to-speech/{voice_id}", body=body)
    elapsed_ms = int((time.time() - started) * 1000)

    target = _safe_output_path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(audio)

    sha1 = hashlib.sha1(audio).hexdigest()
    manifest = {
        "ok": True,
        "tool": tool,
        "created_at": _now(),
        "text_sha1": hashlib.sha1(text.encode("utf-8")).hexdigest(),
        "voice_id": voice_id,
        "model_id": model_id,
        "output_format": output_format,
        "output_path": str(target),
        "audio_bytes": len(audio),
        "audio_sha1": sha1,
        "elapsed_ms": elapsed_ms,
        "estimate": _estimate_cost(text, model_id),
        "secret_value_exposed": False,
    }
    manifest_path = target.with_suffix(target.suffix + ".manifest.json")
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")

    return _base_result(tool, manifest)


def call_elevenlabs_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    try:
        if tool == "elevenlabs.config.check":
            return _config_check(tool)
        if tool == "elevenlabs.models.list":
            return _models_list(tool)
        if tool == "elevenlabs.voices.list":
            return _voices_list(tool, args)
        if tool == "elevenlabs.tts.estimate":
            return _tts_estimate(tool, args)
        if tool == "elevenlabs.tts.test":
            return _tts_test(tool, args)
        return {"tool": tool, "result": {"ok": False, "error": "unknown elevenlabs tool", "would_execute": False}}
    except Exception as exc:
        return _base_result(tool, {
            "ok": False,
            "error": str(exc),
            "secret_value_exposed": False,
        })
