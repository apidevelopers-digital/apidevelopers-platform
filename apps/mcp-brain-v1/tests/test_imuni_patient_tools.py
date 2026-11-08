from app.tools.imuni_patient_tools import PATIENT_TOOL_DEFINITIONS
from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool


def test_patient_real_tools_declared():
    names = {tool["name"] for tool in IMUNI_TOOL_DEFINITIONS}
    assert "imuni.patient.create_REAL" in names
    assert "imuni.patient.search_REAL" in names
    assert "imuni.patient.archive_REAL" in names


def test_patient_create_requires_gate():
    response = call_imuni_tool("imuni.patient.create_REAL", {"full_name": "Paciente Teste"})
    result = response["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["would_execute"] is False
    assert result["executed"] is False
    assert result["real_patient_data_persisted"] is False


def test_patient_tool_definitions_do_not_expose_private_values():
    serialized = repr(PATIENT_TOOL_DEFINITIONS)
    assert "049" not in serialized
    assert "575" not in serialized
    assert "416" not in serialized
    assert "postgres://" not in serialized
    assert "postgresql://" not in serialized
    assert "DATABASE_URL" not in serialized
    assert "IMUNI_R5_INTERNAL_CREDENTIAL_SHA256" not in serialized
    assert "IGOR_APROVA_R5_IMUNI_PATIENT_REAL_V1" not in serialized
