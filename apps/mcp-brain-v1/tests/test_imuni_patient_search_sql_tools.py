from app.tools import imuni_patient_sql_tools as tools


CONFIRM = "IGOR_APROVA_R5_IMUNI_PATIENT_SEARCH_READONLY_V1"


def test_patient_search_requires_readonly_confirmation():
    result = tools.call_patient_sql_tool("imuni.patient.search_REAL", {})["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_search_rejects_invalid_patient_code():
    result = tools.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {"confirmacao": CONFIRM, "patient_code": "../bad"},
    )["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False


def test_patient_search_uses_file_transport_and_returns_minimal_rows(monkeypatch):
    calls = {}

    def fake_psql(sql, variables=None, timeout=25):
        calls["sql"] = sql
        calls["variables"] = variables
        return {
            "ok": True,
            "stdout": "patient_code=PAT-1\tstatus=active\tcreated_at=2026-11-08\tarchived_at=\n",
            "stderr_tail": "",
        }

    monkeypatch.setattr(tools, "psql_file_imuni", fake_psql)
    result = tools.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {"confirmacao": CONFIRM, "patient_code": "PAT-1", "limit": "bad"},
    )["result"]

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["count"] == 1
    assert result["patients"][0]["patient_code"] == "PAT-1"
    assert result["real_patient_data_persisted"] is False
    assert result["raw_patient_data_returned"] is False
    assert result["secret_value_exposed"] is False
    assert result["dsn_exposed"] is False
    assert calls["variables"] is None
    assert "limit 10" in calls["sql"]


def test_patient_mutation_tools_remain_blocked():
    result = tools.call_patient_sql_tool(
        "imuni.patient.create_REAL",
        {"confirmacao": CONFIRM},
    )["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False
