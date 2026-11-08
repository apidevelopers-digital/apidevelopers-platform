from dataclasses import dataclass

from app.tools import imuni_patient_sql_tools as tools

CONFIRM = "IGOR_APROVA_R5_IMUNI_PATIENT_SEARCH_READONLY_V1"
TENANT_ID = "11111111-1111-1111-1111-111111111111"
PRACTITIONER_ID = "22222222-2222-2222-2222-222222222222"


@dataclass
class FakeControls:
    lookup_hmac_key: str = "lookup-key"


def _valid_args(**extra):
    args = {
        "confirmacao": CONFIRM,
        "operator_credential": "private",
        "tenant_id": TENANT_ID,
        "practitioner_id": PRACTITIONER_ID,
        "patient_code": "PAT-1",
    }
    args.update(extra)
    return args


def test_patient_search_requires_readonly_confirmation():
    result = tools.call_patient_sql_tool("imuni.patient.search_REAL", {})["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_search_requires_r5_controls(monkeypatch):
    def fake_controls(args):
        return False, "internal server-side operator credential required."

    monkeypatch.setattr(tools, "require_patient_write_controls", fake_controls)
    result = tools.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        {"confirmacao": CONFIRM, "patient_code": "PAT-1", "tenant_id": TENANT_ID, "practitioner_id": PRACTITIONER_ID},
    )["result"]

    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_search_rejects_invalid_patient_code(monkeypatch):
    monkeypatch.setattr(tools, "require_patient_write_controls", lambda args: (True, FakeControls()))
    result = tools.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        _valid_args(patient_code="../bad"),
    )["result"]

    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False


def test_patient_search_uses_file_transport_rls_context_and_returns_minimal_rows(monkeypatch):
    calls = {}

    def fake_controls(args):
        return True, FakeControls()

    def fake_hmac(value, key):
        calls["hmac"] = (value, key)
        return "cpf-hmac"

    def fake_psql(sql, variables=None, timeout=25):
        calls["sql"] = sql
        calls["variables"] = variables
        calls["timeout"] = timeout
        return {
            "ok": True,
            "stdout": "patient_code=PAT-1\tstatus=active\tcreated_at=2026-11-08\tarchived_at=\n",
            "stderr_tail": "",
        }

    monkeypatch.setattr(tools, "require_patient_write_controls", fake_controls)
    monkeypatch.setattr(tools, "hmac_lookup", fake_hmac)
    monkeypatch.setattr(tools, "psql_file_imuni", fake_psql)

    result = tools.call_patient_sql_tool(
        "imuni.patient.search_REAL",
        _valid_args(patient_code="PAT-1", cpf="04957541612", limit="bad"),
    )["result"]

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["count"] == 1
    assert result["patients"] == [{
        "patient_code": "PAT-1",
        "status": "active",
        "created_at": "2026-11-08",
        "archived_at": "",
    }]
    assert result["real_patient_data_persisted"] is False
    assert result["raw_patient_data_returned"] is False
    assert result["secret_value_exposed"] is False
    assert result["dsn_exposed"] is False
    assert calls["variables"] is None
    assert "set_config('imuni.tenant_id'" in calls["sql"]
    assert "set_config('imuni.practitioner_id'" in calls["sql"]
    assert "cpf-hmac" in calls["sql"]
    assert "limit 10" in calls["sql"]
    assert "04957541612" not in calls["sql"]
    assert calls["hmac"] == ("04957541612", "lookup-key")

def test_patient_mutation_tools_remain_blocked():
    result = tools.call_patient_sql_tool(
        "imuni.patient.create_REAL",
        _valid_args(),
    )["result"]

    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False
