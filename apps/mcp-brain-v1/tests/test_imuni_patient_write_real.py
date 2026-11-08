
from types import SimpleNamespace

from app.tools.imuni_patient_sql_tools import call_patient_sql_tool

CONFIRM_WRITE = "IGOR_APROVA_R5_IMUNI_PATIENT_WRITE_REAL_V1"
TENANT_ID = "11111111-1111-1111-1111-111111111111"
PRACTITIONER_ID = "22222222-2222-2222-2222-222222222222"


def test_patient_create_blocks_without_write_confirmation():
    result = call_patient_sql_tool("imuni.patient.create_REAL", {})["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_archive_blocks_without_patient_code(monkeypatch):
    import app.tools.imuni_patient_sql_tools as module

    monkeypatch.setattr(module, "verify_operator_credential", lambda args: True)
    result = module.call_patient_sql_tool(
        "imuni.patient.archive_REAL",
        {
            "confirmacao": CONFIRM_WRITE,
            "operator_credential": "test",
            "tenant_id": TENANT_ID,
            "practitioner_id": PRACTITIONER_ID,
        },
    )["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["hard_delete"] is False


def test_patient_create_uses_encryption_lookup_and_audit_without_raw_return(monkeypatch):
    import app.tools.imuni_patient_sql_tools as module

    captured = {}

    def fake_controls(args):
        return True, SimpleNamespace(
            encryption_key_id="enc-v1",
            encryption_key="encryption-secret",
            lookup_hmac_key_id="lookup-v1",
            lookup_hmac_key="lookup-secret",
        )

    def fake_psql(sql, variables=None, timeout=25):
        captured["sql"] = sql
        captured["variables"] = variables
        return {
            "ok": True,
            "stdout": "patient_id=33333333-3333-3333-3333-333333333333\ntenant_id=11111111-1111-1111-1111-111111111111\npatient_code=PAT-TEST\nstatus=active\naudit_events_created=1",
            "stderr_tail": "",
        }

    monkeypatch.setattr(module, "verify_operator_credential", lambda args: True)
    monkeypatch.setattr(module, "require_patient_write_controls", fake_controls)
    monkeypatch.setattr(module, "psql_file_imuni", fake_psql)

    result = module.call_patient_sql_tool(
        "imuni.patient.create_REAL",
        {
            "confirmacao": CONFIRM_WRITE,
            "operator_credential": "test",
            "tenant_id": TENANT_ID,
            "practitioner_id": PRACTITIONER_ID,
            "patient_code": "PAT-TEST",
            "full_name": "Paciente Teste",
            "cpf": "12345678901",
            "phone": "48999999999",
            "email": "paciente@example.com",
        },
    )["result"]

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["real_patient_data_persisted"] is True
    assert result["raw_patient_data_returned"] is False
    assert result["secret_value_exposed"] is False
    assert result["patient"]["patient_code"] == "PAT-TEST"
    assert captured["variables"] is None
    assert "pgp_sym_encrypt" in captured["sql"]
    assert "imuni_audit.events" in captured["sql"]
    assert "raw_patient_data_in_audit" in captured["sql"]


def test_patient_archive_is_soft_delete_and_audited(monkeypatch):
    import app.tools.imuni_patient_sql_tools as module

    captured = {}

    def fake_psql(sql, variables=None, timeout=25):
        captured["sql"] = sql
        return {
            "ok": True,
            "stdout": "patient_id=33333333-3333-3333-3333-333333333333\ntenant_id=11111111-1111-1111-1111-111111111111\npatient_code=PAT-TEST\nstatus=archived\naudit_events_created=1",
            "stderr_tail": "",
        }

    monkeypatch.setattr(module, "verify_operator_credential", lambda args: True)
    monkeypatch.setattr(module, "psql_file_imuni", fake_psql)

    result = module.call_patient_sql_tool(
        "imuni.patient.archive_REAL",
        {
            "confirmacao": CONFIRM_WRITE,
            "operator_credential": "test",
            "tenant_id": TENANT_ID,
            "practitioner_id": PRACTITIONER_ID,
            "patient_code": "PAT-TEST",
            "reason_code": "patient_request",
        },
    )["result"]

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["hard_delete"] is False
    assert result["real_patient_data_persisted"] is False
    assert "update imuni.patients" in captured["sql"]
    assert "status = 'archived'" in captured["sql"]
    assert "patient.archive_REAL" in captured["sql"]
    assert "delete from" not in captured["sql"].lower()
