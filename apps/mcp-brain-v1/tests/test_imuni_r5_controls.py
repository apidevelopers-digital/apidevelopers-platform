from app.tools.imuni_r5_controls import (
    email_hmac_lookup,
    hmac_lookup,
    public_controls_status,
    require_patient_write_controls,
    verify_operator_credential,
)


def test_operator_credential_requires_server_hash(monkeypatch):
    monkeypatch.delenv("IMUNI_R5_OPERATOR_CREDENTIAL_SHA256", raising=False)
    assert verify_operator_credential({"operator_credential": "secret"}) is False


def test_operator_credential_accepts_hash(monkeypatch):
    monkeypatch.setenv("IMUNI_R5_OPERATOR_CREDENTIAL_SHA256", "2bb80d537b1da3e38bd30361aa855686bde0ba9feb455d9c98f5f6e4a0a29")
    assert verify_operator_credential({"operator_credential": "secret"}) is True


def test_patient_write_controls_require_separate_keys(monkeypatch):
    monkeypatch.setenv("IMUNI_R5_OPERATOR_CREDENTIAL_SHA256", "2bb80d537b1da3e38bd30361aa855686bde0ba9feb455d9c98f5f6e4a0a29")
    ok, reason = require_patient_write_controls({"operator_credential": "secret"})
    assert ok is False
    assert "patient encryption key" in reason
    assert "patient lookup HMAC key" in reason


def test_hmac_lookup_is_keyed_and_deterministic():
    assert hmac_lookup("049.575.416-12", "k1") == hmac_lookup("04957541612", "k1")
    assert hmac_lookup("04957541612", "k1") != hmac_lookup("04957541612", "k2")


def test_email_hmac_lookup_normalizes_case():
    assert email_hmac_lookup("IGOR@EXAMPLE.COM", "k") == email_hmac_lookup("igor@example.com", "k")


def test_public_status_exposes_no_secret_values(monkeypatch):
    monkeypatch.setenv("IMUNI_PATIENT_ENCRYPTION_KEY", "super-secret")
    status = public_controls_status()
    assert status["secret_value_exposed"] is False
    assert status["dsn_exposed"] is False
    assert "super-secret" not in repr(status)
