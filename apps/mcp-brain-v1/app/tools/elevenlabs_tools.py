from __future__ import annotations
import hashlib, json, os, time, urllib.error, urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1"
DEFAULT_MODEL_ID = "eleven_multilingual_v2"
DEFAULT_OUTPUT_FORMAT = "mp3_44100_128"
DEFAULT_TIMEOUT_SECONDS = 45
MAX_TTS_CHARS = 5000
TTS_CONFIRMATION = "IGOR_APROVA_ELEVENLABS_TTS_REAL"

ELEVENLABS_TOOL_DEFINITIONS = [
    {"name": "elevenlabs.config.check", "risk": "R1", "category": "media/tts", "mode": "read", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Confere se a integração ElevenLabs está configurada sem expor a API key.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "elevenlabs.models.list", "risk": "R1", "category": "media/tts", "mode": "read/api", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Lista modelos ElevenLabs disponíveis. Não gera áudio.", "input_schema": {"type": "object", "properties": {}}},
    {"name": "elevenlabs.voices.list", "risk": "R1", "category": "media/tts", "mode": "read/api", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Lista vozes ElevenLabs disponíveis com metadados seguros. Não gera áudio.", "input_schema": {"type": "object", "properties": {"limit": {"type": "integer", "minimum": 1, "maximum": 100}, "query": {"type": "string"}, "use_case": {"type": "string"}, "language": {"type": "string"}}}},
    {"name": "elevenlabs.tts.estimate", "risk": "R2", "category": "media/tts", "mode": "dry-run/estimate", "plugin_ready": True, "would_execute": False, "requires_confirmation": False, "description": "Estima caracteres e custo aproximado antes de gerar áudio.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}, "model_id": {"type": "string"}}, "required": ["text"]}},
    {"name": "elevenlabs.tts.test", "risk": "R4", "category": "media/tts", "mode": "paid-api/write-file", "plugin_ready": True, "would_execute": True, "requires_confirmation": True, "description": "Gera um único MP3 de teste via ElevenLabs. Usa créditos externos e exige confirmação.", "input_schema": {"type": "object", "properties": {"text": {"type": "string"}, "voice_id": {"type": "string"}, "model_id": {"type": "string"}, "output_path": {"type": "string"}, "output_format": {"type": "string"}, "confirmacao": {"type": "string"}}, "required": ["text", "voice_id", "output_path", "confirmacao"]}},
]

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

def _api_key() -> str:
    value = os.environ.get("ELEVENLABS_API_KEY", "")
    if len(value) < 20:
        raise RuntimeError("ELEVENLABS_API_KEY is not configured in environment")
    return value

def _secret_status() -> dict[str, Any]:
    value = os.environ.get("ELEVENLABS_API_KEY", "")
    return {"configured": len(value) >= 20, "source": "env", "sha1_prefix": hashlib.sha1(value.encode()).hexdigest()[:10] if value else None, "key_not_returned": True}

def _request(path: str, *, accept: str, body: dict[str, Any] | None = None) -> bytes:
    data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
    headers = {"Accept": accept, "xi-api-key": _api_key()}
    if body is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(ELEVENLABS_API_BASE + path, data=data, headers=headers, method="POST" if body is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=DEFAULT_TIMEOUT_SECONDS) as response:
            return response.read()
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"ElevenLabs API error {exc.code}: {raw[:500]}") from exc

def _request_json(path: str) -> Any:
    raw = _request(path, accept="application/json")
    return json.loads(raw.decode("utf-8")) if raw else {}

def _request_audio(path: str, body: dict[str, Any]) -> bytes:
    return _request(path, accept="audio/mpeg", body=body)

def _sanitize_voice(v: dict[str, Any]) -> dict[str, Any]:
    labels = v.get("labels") if isinstance(v.get("labels"), dict) else {}
    return {"name": v.get("name"), "voice_id": v.get("voice_id"), "category": v.get("category"), "description": v.get("description"), "preview_url_present": bool(v.get("preview_url")), "labels": {k: labels.get(k) for k in ("accent", "description", "age", "gender", "use_case", "locale", "language")}}

def _rank_voice(v: dict[str, Any]) -> int:
    text = json.dumps(v, ensure_ascii=False).lower()
    keywords = ("narration", "narrative", "story", "storytelling", "audiobook", "documentary", "calm", "deep", "professional", "adult", "middle aged", "portuguese", "brazil", "brasil")
    return sum(2 for keyword in keywords if keyword in text)

def _estimate_cost(text: str, model_id: str) -> dict[str, Any]:
    chars = len(text)
    lower_model = (model_id or "").lower()
    usd_per_1000 = 0.04 if ("turbo" in lower_model or "flash" in lower_model) else 0.08
    return {"characters": chars, "model_id": model_id or DEFAULT_MODEL_ID, "estimated_usd_per_1000_chars": usd_per_1000, "estimated_usd": round(chars / 1000 * usd_per_1000, 4), "billing_note": "Estimate only. ElevenLabs workspace billing is the source of truth."}

def _safe_output_path(path: str) -> Path:
    if not path or "\x00" in path:
        raise ValueError("invalid output_path")
    normalized = Path(path)
    if normalized.is_absolute():
        roots = ("/tmp/", "/mnt/data/", "/opt/api-dev-brain/", "/home/")
        if not any(str(normalized).startswith(root) for root in roots):
            raise ValueError("output_path outside allowed roots")
        return normalized
    return Path("/tmp/ada-elevenlabs") / normalized

def _config_check(tool: str) -> dict[str, Any]:
    return _base_result(tool, {"integration": "elevenlabs", "secret_status": _secret_status(), "api_base": ELEVENLABS_API_BASE, "audio_generation_enabled": True, "requires_confirmation_for_tts": True, "tts_confirmation_literal": TTS_CONFIRMATION})

def _models_list(tool: str) -> dict[str, Any]:
    payload = _request_json("/models")
    models = payload if isinstance(payload, list) else []
    safe = [{"model_id": m.get("model_id"), "name": m.get("name"), "can_do_text_to_speech": m.get("can_do_text_to_speech"), "can_do_voice_conversion": m.get("can_do_voice_conversion"), "languages": (m.get("languages") or [])[:20]} for m in models]
    return _base_result(tool, {"models_count": len(safe), "models": safe, "credits_used": "none_expected_metadata_only"})

def _voices_list(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    payload = _request_json("/voices")
    voices = payload.get("voices") if isinstance(payload, dict) else []
    sanitized = [_sanitize_voice(v) for v in voices if isinstance(v, dict)]
    for key in ("query", "use_case", "language"):
        term = str(args.get(key) or "").strip().lower()
        if term:
            sanitized = [v for v in sanitized if term in json.dumps(v, ensure_ascii=False).lower()]
    limit = max(1, min(100, int(args.get("limit") or 15)))
    ranked = sorted(sanitized, key=_rank_voice, reverse=True)
    return _base_result(tool, {"voices_count": len(sanitized), "returned": min(limit, len(ranked)), "recommended_voice_candidates": ranked[:limit], "credits_used": "none_expected_metadata_only"})

def _tts_estimate(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    text = str(args.get("text") or "").strip()
    if not text:
        return _base_result(tool, {"ok": False, "error": "text is required"})
    return _base_result(tool, {"dry_run": True, **_estimate_cost(text, str(args.get("model_id") or DEFAULT_MODEL_ID))})

def _tts_test(tool: str, args: dict[str, Any]) -> dict[str, Any]:
    if args.get("confirmacao") != TTS_CONFIRMATION:
        return _base_result(tool, {"ok": False, "error": "confirmation_required", "required_confirmacao": TTS_CONFIRMATION, "would_execute": True})
    text = str(args.get("text") or "").strip()
    voice_id = str(args.get("voice_id") or "").strip()
    output_path = str(args.get("output_path") or "").strip()
    model_id = str(args.get("model_id") or DEFAULT_MODEL_ID)
    output_format = str(args.get("output_format") or DEFAULT_OUTPUT_FORMAT)
    errors = []
    if not text:
        errors.append("text is required")
    if len(text) > MAX_TTS_CHARS:
        errors.append(f"text exceeds {MAX_TTS_CHARS} characters")
    if not voice_id:
        errors.append("voice_id is required")
    if not output_path:
        errors.append("output_path is required")
    if errors:
        return _base_result(tool, {"ok": False, "errors": errors})

    body = {"text": text, "model_id": model_id, "output_format": output_format, "voice_settings": {"stability": 0.55, "similarity_boost": 0.75, "style": 0.25, "use_speaker_boost": True}}
    started = time.time()
    audio = _request_audio(f"/text-to-speech/{voice_id}", body)
    elapsed_ms = int((time.time() - started) * 1000)
    target = _safe_output_path(output_path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_bytes(audio)

    manifest = {"ok": True, "tool": tool, "created_at": _now(), "text_sha1": hashlib.sha1(text.encode("utf-8")).hexdigest(), "voice_id": voice_id, "model_id": model_id, "output_format": output_format, "output_path": str(target), "audio_bytes": len(audio), "audio_sha1": hashlib.sha1(audio).hexdigest(), "elapsed_ms": elapsed_ms, "estimate": _estimate_cost(text, model_id), "secret_value_exposed": False}
    target.with_suffix(target.suffix + ".manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    return _base_result(tool, manifest)

def call|elevenlabs_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
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
        return _base_result(tool, {"ok": False, "error": str(exc), "secret_value_exposed": False})
