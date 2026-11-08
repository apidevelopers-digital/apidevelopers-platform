from app.tools.imuni_psql_transport import decode_docker_raw_stream, kv_lines_to_dict


def _frame(stream_type: int, payload: bytes) -> bytes:
    return bytes([stream_type]) + b"\x00\x00\x00" + len(payload).to_bytes(4, "big") + payload


def test_decode_docker_raw_stream_demultiplexes_stdout_and_stderr():
    raw_bytes = _frame(1, b"ok=true\n") + _frame(2, b"warning_tail=none\n")
    decoded = decode_docker_raw_stream(raw_bytes.decode("latin1"))
    assert "ok=true" in decoded
    assert "warning_tail=none" in decoded


def test_decode_docker_raw_stream_returns_plain_text():
    assert decode_docker_raw_stream("plain=text") == "plain=text"


def test_kv_lines_to_dict_parses_one_equals_per_line():
    parsed = kv_lines_to_dict("patient_code=PAT-1\nstatus=active\nnot_kv")
    assert parsed == {"patient_code": "PAT-1", "status": "active"}
