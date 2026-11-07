from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool


def test_practitioner_tool_is_declared():
    names = {tool["name"] for tool in IMUNI_TOOL_DEFINITIONS}
    assert "imuni.practitioner.upsert_IGOR_REAL" in names


def test_practitioner_tool_requires_confirmation():
    response = call_imuni_tool("imuni.practitioner.upsert_IGOR_REAL", {})
    result = response["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["would_execute"] is False
    assert result["clinical_data_persisted"] is False


def test_practitioner_tool_definition_does_not_expose_cpf_or_secret():
    serialised = repr(IMUNI_TOOL_DEFINITIONS)
    assert "049" not in serialised
    assert "575" not in serialised
    assert "416" not in serialised
    assert ".env" not in serialised
    assert "DSN" not in serialised
