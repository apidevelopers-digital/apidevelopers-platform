from app.tools.imuni_patient_sql_tools import call_patient_sql_tool

CONFIRM = "IGOR_APROVA_R5_IMUNI_PATIENT_SEARCH_READONLY_V1"
TENANT_ID = "11111111-1111-1111-1111-111111111111"
PRACTITIONER_ID = "22222222-2222-2222-2222-222222222222"


def test_patient_search_blocks_without_confirmation():
    result = call_patient_sql_tool("imuni.patient.search_REAL", {})["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_search_requires_operator_credential():
    result = call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {"confirmacao": CONFIRM, "patient_code": "PAT-1", "tenant_id": TENANT_ID, "practitioner_id": PRACTITIONER_ID},
    )["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert "credential" in result["reason"]


def test_patient_create_remains_blocked():
    result = call_patient_sql_tool("imuni.patient.create_REAL", {})["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["hard_delete"] is False


def test_patient_search_rejects_invalid_patient_code(monkeypatch):
    import app.tools.imuni_patient_sql_tools as module

    monkeypatch.setattr(module, "verify_operator_credential", lambda args: True)
    result = module.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {
            "confirmacao": CONFIRM,
            "operator_credential": "test",
            "tenant_id": TENANT_ID,
            "practitioner_id": PRACTITIONER_ID,
            "patient_code": "../bad",
        },
    )["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert "invalid format" in result["reason"]


def test_patient_search_uses_psql_file_transport_with_rls_context(monkeypatch):
    captured = {}

    def fake_psql(sql, variables=None, timeout=25):
        captured["sql"] = sql
        captured["variables"] = variables
        return {"ok": True, "stdout": "patient_code=PAT-1\tstatus=active\tcreated_at=2026-01-01\tarchived_at="}

    import app.tools.imuni_patient_sql_tools as module

    monkeypatch.setattr(module, "verify_operator_credential", lambda args: True)
    monkeypatch.setattr(module, "psql_file_imuni", fake_psql)

    result = module.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {
            "confirmacao": CONFIRM,
            "operator_credential": "test",
            "tenant_id": TENANT_ID,
            "practitioner_id": PRACTITIONER_ID,
            "patient_code": "PAT-1",
            "limit": "abc",
        },
    )["result"]

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["count"] == 1
    assert result["patients"][0]["patient_code"] == "PAT-1"
    assert result["raw_patient_data_returned"] is False
    assert result["real_patient_data_persisted"] is False
    assert captured["variables"] is None
    assert "set_config('imuni.tenant_id'" in captured["sql"]
    assert "set_config('imuni.practitioner_id'" in captured["sql"]
    assert "limit 10" in captured["sql"]
