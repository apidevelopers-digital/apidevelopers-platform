from app.tools.imuni_db_tools import clean_docker_exec_lines, clean_key_value_count_line
from app.tools.imuni_tools import IMUNI_TOOL_DEFINITIONS, call_imuni_tool


def test_tool_catalog_contains_db_tools():
    names = {item["name"] for item in IMUNI_TOOL_DEFINITIONS}
    assert "imuni.db.status" in names
    assert "imuni.db.schema.check" in names
    assert "imuni.db.synthetic.counts" in names
    assert "imuni.db.synthetic.seed" in names


def test_clean_docker_exec_lines_removes_stream_prefix():
    lines = clean_docker_exec_lines("�imuni.access_grants\nimuni.patients\n�imuni_audit.events=true\n")
    assert lines == ["imuni.access_grants", "imuni.patients", "imuni_audit.events=true"]


def test_clean_key_value_count_line_normalizes_stream_prefix():
    assert clean_key_value_count_line("Atenants=1") == ("tenants", 1)
    assert clean_key_value_count_line("�patients=3") == ("patients", 3)
    assert clean_key_value_count_line("ignored") is None


def test_synthetic_seed_blocks_without_ack():
    response = call_imuni_tool(
        "imuni.db.synthetic.seed",
        {"confirmacao": "IGOR_APROVA_R5"},
    )
    payload = response["result"]
    assert payload["ok"] is False
    assert payload["blocked"] is True
    assert payload["clinical_data_persisted"] is False


def test_synthetic_seed_blocks_without_r5_confirmation():
    response = call_imuni_tool(
        "imuni.db.synthetic.seed",
        {"synthetic_ack": True, "confirmacao": "WRONG"},
    )
    payload = response["result"]
    assert payload["ok"] is False
    assert payload["blocked"] is True
    assert payload["clinical_data_persisted"] is False
