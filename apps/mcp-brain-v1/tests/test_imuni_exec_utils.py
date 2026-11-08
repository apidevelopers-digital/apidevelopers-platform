from app.tools.imuni_exec_utils import (
    demux_docker_exec_bytes,
    docker_exec_text,
    parse_key_value_rows,
)


def _frame(stream: int, payload: bytes) -> bytes:
    return bytes([stream, 0, 0, 0]) + len(payload).to_bytes(4, "big") + payload


def test_docker_exec_text_accepts_dict_stdout():
    assert docker_exec_text({"stdout": "ok"}) == "ok"


def test_demux_docker_exec_bytes_handles_stdout_frame():
    payload = _frame(1, b"patient_id=1\n")
    assert demux_docker_exec_bytes(payload) == b"patient_id=1\n"
    assert docker_exec_text(payload) == "patient_id=1\n"


def test_demux_docker_exec_bytes_handles_multiple_frames():
    payload = _frame(1, b"patient_id=1\n") + _frame(1, b"status=active\n")
    assert docker_exec_text(payload) == "patient_id=1\nstatus=active\n"


def test_demux_docker_exec_bytes_falls_back_for_plain_text():
    assert docker_exec_text("patient_id=1\n") == "patient_id=1\n"


def test_parse_key_value_rows_from_framed_payload():
    payload = _frame(
        1,
        b"patient_id=1\nstatus=active\n---ROW---\npatient_id=2\nstatus=archived",
    )
    rows = parse_key_value_rows(payload)
    assert rows == [
        {"patient_id": "1", "status": "active"},
        {"patient_id": "2", "status": "archived"},
    ]
