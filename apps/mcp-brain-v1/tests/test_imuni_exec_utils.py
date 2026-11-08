from app.tools.imuni_exec_utils import docker_exec_text, parse_key_value_rows


def test_docker_exec_text_accepts_dict_stdout():
    assert docker_exec_text({"stdout": "ok"}) == "ok"


def test_docker_exec_text_strips_non_printable_multiplex_bytes():
    assert docker_exec_text("\x01\x00ok\n") == "ok\n"


def test_parse_key_value_rows():
    rows = parse_key_value_rows("patient_id=1\nstatus=active\n---ROW---\npatient_id=2\nstatus=archived")
    assert rows == [
        {"patient_id": "1", "status": "active"},
        {"patient_id": "2", "status": "archived"},
    ]
