from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(os.environ.get("IMUNI_ATTACHMENT_ROOT", "/opt/api-dev-brain/registry/imuni/attachments")).resolve()
UPLOAD_ROOT = Path(os.environ.get("IMUNI_UPLOAD_ROOT", "/opt/api-dev-brain/registry/imuni/uploads")).resolve()

_ATTACHMENT_ID_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,160}$")
_ALLOWED_SUFFIXES = (
    "",
    ".b64",
    ".media.json",
    ".transcript.json",
    ".webm",
    ".ogg",
    ".opus",
    ".mp3",
    ".m4a",
    ".wav",
    ".upload.json",
)
_MEDIA_SUFFIXES = (".webm", ".ogg", ".opus", ".mp3", ".m4a", ".wav")
_SIDECAR_SUFFIXES = (".upload.json", ".media.json", ".transcript.json")


ATTACHMENT_TOOL_DEFINITIONS = [
    {
        "name": "imuni.attachment.resolve_ASSISTED",
        "risk": "R2",
        "category": "imuni",
        "mode": "read_metadata_only",
        "plugin_ready": True,
        "would_execute": False,
        "requires_confirmation": False,
        "description": "Resolve um attachment_id Imuni para metadados seguros, sem expor path absoluto, conteúdo, base64 ou segredos.",
        "input_schema": {
            "type": "object",
            "properties": {
                "attachment_id": {"type": "string", "minLength": 1, "maxLength": 180}
            },
            "required": ["attachment_id"],
        },
    },
]


def is_attachment_tool(tool: str) -> bool:
    return any(t["name"] == tool for t in ATTACHMENT_TOOL_DEFINITIONS)


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _safe_attachment_id(value: Any) -> str:
    attachment_id = str(value or "").strip()
    if not attachment_id:
        raise ValueError("attachment_id is required")
    if "/" in attachment_id or "\\" in attachment_id or ".." in attachment_id:
        raise ValueError("invalid attachment_id")
    if not _ATTACHMENT_ID_RE.match(attachment_id):
        raise ValueError("invalid attachment_id")
    return attachment_id


def _is_relative_to(path: Path, root: Path) -> bool:
    try:
        path.resolve().relative_to(root)
        return True
    except ValueError:
        return False


def _candidate_path(root: Path, name: str) -> Path | None:
    candidate = (root / name).resolve()
    if not _is_relative_to(candidate, root):
        return None
    return candidate


def _storage_uri_for(path: Path, root: Path, prefix: str) -> str | None:
    try:
        rel = path.resolve().relative_to(root)
    except ValueError:
        return None
    return f"{prefix}/{rel.as_posix()}"


def _sha256_for(path: Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _read_json_metadata(path: Path) -> dict[str, Any]:
    if not path.is_file():
        return {}
    try:
        text = path.read_text(encoding="utf-8")
        data = json.loads(text)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _safe_uri(value: Any) -> str | None:
    if not isinstance(value, str):
        return None
    if value.startswith("registry://imuni/attachments/") or value.startswith("registry://imuni/uploads/"):
        if ".." not in value and "\\" not in value:
            return value
    return None


def _safe_manifest_subset(data: dict[str, Any]) -> dict[str, Any]:
    safe: dict[str, Any] = {}
    for key in ("attachment_id", "upload_id", "storage_uri", "mime", "size_bytes", "sha256", "created_at", "finalized"):
        if key in data and data[key] is not None:
            if key == "storage_uri":
                uri = _safe_uri(data[key])
                if uri:
                    safe[key] = uri
            elif key == "size_bytes":
                try:
                    safe[key] = int(data[key])
                except Exception:
                    pass
            elif key == "finalized":
                safe[key] = bool(data[key])
            else:
                safe[key] = str(data[key]) if key not in {"finalized"} else data[key]
    return safe


def _metadata_for_file(path: Path, root: Path, prefix: str) -> dict[str, Any]:
    stat = path.stat()
    mime, _ = mimetypes.guess_type(path.name)
    return {
        "storage_uri": _storage_uri_for(path, root, prefix),
        "mime": mime or "application/octet-stream",
        "size_bytes": int(stat.st_size),
        "sha256": _sha256_for(path),
        "created_at": datetime.fromttimestamp(stat.st_mtime, timezone.utc).isoformat(),
        "finalized": True,
    }


def _resolve_attachment(args: dict[str, Any]) -> dict[str, Any]:
    try:
        attachment_id = _safe_attachment_id(args.get("attachment_id"))
    except ValueError as exc:
        return {
            "tool": "imuni.attachment.resolve_ASSISTED",
            "result": {
                "ok": False,
                "found": False,
                "error": str(exc),
                "would_execute": False,
                "secret_value_exposed": False,
                "content_exposed": False,
            },
        }

    candidate_names = []
    for suffix in _ALLOWED_SUFFIXES:
        name = attachment_id if not suffix or attachment_id.endswith(suffix) else f"{attachment_id}{suffix}"
        if name not in candidate_names:
            candidate_names.append(name)

    candidate_uris: list[str] = []
    sidecar_data: dict[str, Any] = {}
    found_file: Path | None = None

    for name in candidate_names:
        path = _candidate_path(ROOT, name)
        if path is None:
            continue
        uri = _storage_uri_for(path, ROOT, "registry://imuni/attachments")
        if uri:
            candidate_uris.append(uri)
        if path.is_file():
            if path.name.endswith(_SIDECAR_SUFFIXES):
                sidecar_data.update(_safe_manifest_subset(_read_json_metadata(path)))
                if found_file is None:
                    manifest_uri = _safe_uri(sidecar_data.get("storage_uri"))
                    if manifest_uri and manifest_uri.startswith("registry://imuni/attachments/"):
                        rel = manifest_uri.removeprefix("registry://imuni/attachments/")
                        manifest_path = _candidate_path(ROOT, rel)
                        if manifest_path and manifest_path.is_file():
                            found_file = manifest_path
            elif path.suffix in _MEDIA_SUFFIXES or path.name == attachment_id or path.name.endswith(".b64"):
                found_file = path
                break

    # If caller passed upload_id or a derived attachment id, inspect only exact safe upload manifests.
    upload_manifest_names = [f"{attachment_id}.upload.json", f"{attachment_id}.json", attachment_id]
    for name in upload_manifest_names:
        path = _candidate_path(UPLOAD_ROOT, name)
        if path is None:
            continue
        uri = _storage_uri_for(path, UPLOAD_ROOT, "registry://imuni/uploads")
        if uri:
            candidate_uris.append(uri)
        if path.is_file():
            manifest = _safe_manifest_subset(_read_json_metadata(path))
            sidecar_data.update({k: v for k, v in manifest.items() if v is not None})
            manifest_uri = _safe_uri(manifest.get("storage_uri"))
            if found_file is None and manifest_uri and manifest_uri.startswith("registry://imuni/attachments/"):
                rel = manifest_uri.removeprefix("registry://imuni/attachments/")
                manifest_path = _candidate_path(ROOT, rel)
                if manifest_path and manifest_path.is_file():
                    found_file = manifest_path

    result: dict[str, Any] = {
        "ok": True,
        "found": found_file is not None or bool(sidecar_data.get("storage_uri")),
        "attachment_id": attachment_id,
        "would_execute": False,
        "secret_value_exposed": False,
        "content_exposed": False,
        "absolute_path_exposed": False,
        "candidate_uris": sorted(set(candidate_uris)),
        "generated_at": _utc_now(),
    }

    if sidecar_data:
        result.update(sidecar_data)

    if found_file is not None:
        result.update(_metadata_for_file(found_file, ROOT, "registry://imuni/attachments"))
        result["found"] = True

    # Never return filesystem paths, file bytes or base64 payloads.
    return {"tool": "imuni.attachment.resolve_ASSISTED", "result": result}


def call_attachment_tool(tool: str, args: dict[str, Any] | None = None) -> dict[str, Any]:
    args = args or {}
    if tool == "imuni.attachment.resolve_ASSISTED":
        return _resolve_attachment(args)
    return {
        "tool": tool,
        "result": {
            "ok": False,
            "error": "unknown imuni attachment tool",
            "would_execute": False,
            "secret_value_exposed": False,
        },
    }
