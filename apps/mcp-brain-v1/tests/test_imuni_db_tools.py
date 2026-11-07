from app.tools.imuni_db_tools import (
    DB_TOOL_DEFINITIONS,
    clean_docker_exec_lines,
    clean_key_value_count_line,
    call_db_tool,
    is_db_tool,
)


def _payload(response):
    """DB tools return the standard MCP-like envelope: {tool, result}."""
    return response["result"]


def test_db_tool_definitions_include_verified_runtime_tools():
    names = {tool["name"] for tool in DB_TOOL_DEFINITIONS}

    assert {
        "imuni.db.status",
        "imuni.db.schema.check",
        "imuni.db.synthetic.counts",
        "imuni.db.synthetic.seed",
    } <= names

    assert is_db_tool("imuni.db.status") is True
    assert is_db_tool("imuni.db.synthetic.seed") is True
    assert is_db_tool("imuni.unknown") is False


def test_clean_docker_exec_lines_removes_stream_prefixes():
    raw = "\ufffdimuni.access_grants\nimuni.attachments\n\x00\x01imuni_audit.events=true\nnoise"
    lines = clean_docker_exec_lines(raw)

    assert "imuni.access_grants" in lines
    assert "imuni.attachments" in lines
    assert "imuni_audit.events=true" in lines
    assert "noise" in lines


def test_clean_key_value_count_line_normalizes_docker_stream_artifacts():
    assert clean_key_value_count_line("Atenants=1") == ("tenants", 1)
    assert clean_key_value_count_line("\ufffdpatients=2") == ("patients", 2)
    assert clean_key_value_count_line("audit_events=3") == ("audit_events", 3)
    assert clean_key_value_count_line("not_a_counter=9") is None


def test_synthetic_seed_blocks_without_ack():
    response = call_db_tool(
        "imuni.db.synthetic.seed",
        {"confirmacao": "IGOR_APROVA_R5"},
    )
    payload = _payload(response)

    assert payload["ok"] is False
    assert payload["blocked"] is True
    assert payload["would_execute"] is False
    assert payload["clinical_data_persisted"] is False


def test_synthetic_seed_blocks_without_r5_confirmation():
    response = call_db_tool(
        "imuni.db.synthetic.seed",
        {"synthetic_ack": True, "confirmacao": "WRONG"},
    )
    payload = _payload(response)

    assert payload["ok"] is False
    assert payload["blocked"] is True
    assert payload["would_execute"] is False
    assert payload["clinical_data_persisted"] is False


def test_source_control_runtime_db_calls_are_fail_closed():
    for tool_name in (
        "imuni.db.status",
        "imuni.db.schema.check",
        "imuni.db.synthetic.counts",
    ):
        response = call_db_tool(tool_name, {})
        payload = _payload(response)

        assert payload["ok"] is False
        assert payload["blocked"] is True
        assert payload["secret_value_exposed"] is False
        assert payload["dsn_exposed"] is False
