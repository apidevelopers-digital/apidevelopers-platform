from app.tools.imuni_practitioner_tools import PRACTITIONER_TOOL_DEFINITIONS
from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool


def _practitioner_definition() -> dict:
    return next(
        tool
        for tool in PRACTITIONER_TOOL_DEFINITIONS
        if tool["name"] == "imuni.practitioner.upsert_IGOR_REAL"
    )


def test_practitioner_tool_is_declared():
    names = {tool["name"] for tool in IMUNI_TOOL_DEFINITIONS}
    assert "imuni.practitioner.upsert_IGOR_REAL" in names


def test_practitioner_tool_requires_confirmation_and_internal_credential():
    response = call_imuni_tool("imuni.practitioner.upsert_IGOR_REAL", {})
    result = response["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["would_execute"] is False
    assert result["clinical_data_persisted"] is False

    response = call_imuni_tool(
        "imuni.practitioner.upsert_IGOR_REAL",
        {"confirmacao": "IGOR_APROVA_R5_CADASTRO_MEDICO_IMUNI"},
    )
    result = response["result"]
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["would_execute"] is False
    assert result["clinical_data_persisted"] is False
    assert "internal server-side credential" in result["reason"]


def test_practitioner_tool_definition_does_not_expose_secret_values():
    serialised = repr(_practitioner_definition())
    assert "049" not in serialised
    assert "575" not in serialised
    assert "416" not in serialised
    assert ".env" not in serialised
    assert "DSN" not in serialised
    assert "IGOR_APROVA_R5_CADASTRO_MEDICO_IMUNI" not in serialised
    assert "IMUNI_R5_INTERNAL_CREDENTIAL_SHA256" not in serialised
