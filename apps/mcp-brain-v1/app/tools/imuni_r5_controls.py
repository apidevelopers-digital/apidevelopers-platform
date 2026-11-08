from __future__ import annotations

import hashlib
import hmac
import os
from dataclasses import dataclass
from typing import Any


_OPERATOR_HASH_ENV = "IMUNI_R5_OPERATOR_CREDENTIAL_SHA256"
_ENCRYPTION_KEY_ENV = "IMUNI_PATIENT_ENCRYPTION_KEY"
_ENCRYPTION_KEY_ID_ENV = "IMUNI_PATIENT_ENCRYPTION_KEY_ID"
_LOOKUP_HMAC_KEY_ENV = "IMUNI_PATIENT_LOOKUP_HMAC_KEY"
_LOOKUP_HMAC_KEY_ID_ENV = "IMUNI_PATIENT_LOOKUP_HMAC_KEY_ID"


@dataclass(frozen=True)
class PatientWriteControls:
    operator_ok: bool
    encryption_key_id: str
    encryption_key: str
    lookup_hmac_key_id: str
    lookup_hmac_key: str


def _sha256(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _env(name: str) -> str:
    return os.environ.get(name, "").strip()


def verify_operator_credential(args: dict[str, Any]) -> bool:
    expected = _env(_OPERATOR_HASH_ENV)
    supplied = str(args.get("operator_credential") or "")
    if not expected or not supplied:
        return False
    return hmac.compare_digest(_sha256(supplied), expected)


def require_patient_write_controls(args: dict[str, Any]) -> tuple[bool, str | PatientWriteControls]:
    if not verify_operator_credential(args):
        return False, "internal server-side operator credential required."

    encryption_key_id = _env(_ENCRYPTION_KEY_ID_ENV)
    encryption_key = _env(_ENCRYPTION_KEY_ENV)
    lookup_hmac_key_id = _env(_LOOKUP_HMAC_KEY_ID_ENV)
    lookup_hmac_key = _env(_LOOKUP_HMAC_KEY_ENV)

    missing = []
    if not encryption_key_id:
        missing.append("patient encryption key id")
    if not encryption_key:
        missing.append("patient encryption key")
    if not lookup_hmac_key_id:
        missing.append("patient lookup HMAC key id")
    if not lookup_hmac_key:
        missing.append("patient lookup HMAC key")

    if missing:
        return False, "missing R5 patient write controls: " + ", ".join(missing) + "."

    return True, PatientWriteControls(
        operator_ok=True,
        encryption_key_id=encryption_key_id,
        encryption_key=encryption_key,
        lookup_hmac_key_id=lookup_hmac_key_id,
        lookup_hmac_key=lookup_hmac_key,
    )


def hmac_lookup(value: str | None, key: str) -> str | None:
    normalized = "".join(ch for ch in str(value or "") if ch.isdigit())
    if not normalized:
        return None
    return hmac.new(key.encode("utf-8"), normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def email_hmac_lookup(value: str | None, key: str) -> str | None:
    normalized = str(value or "").strip().lower()
    if not normalized:
        return None
    return hmac.new(key.encode("utf-8"), normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def public_controls_status() -> dict[str, Any]:
    """Return non-secret readiness flags for diagnostics and tests."""
    return {
        "operator_credential_hash_configured": bool(_env(_OPERATOR_HASH_ENV)),
        "patient_encryption_key_configured": bool(_env(_ENCRYPTION_KEY_ENV)),
        "patient_encryption_key_id_configured": bool(_env(_ENCRYPTION_KEY_ID_ENV)),
        "patient_lookup_hmac_key_configured": bool(_env(_LOOKUP_HMAC_KEY_ENV)),
        "patient_lookup_hmac_key_id_configured": bool(_env(_LOOKUP_HMAC_KEY_ID_ENV)),
        "secret_value_exposed": False,
        "dsn_exposed": False,
    }
