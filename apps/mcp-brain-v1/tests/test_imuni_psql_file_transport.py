import tarfile
from io import BytesIO

import pytest

from app.tools import imuni_psql_file_transport as transport


def test_tar_single_file_rejects_unsafe_filename():
    with pytest.raises(ValueError):
        transport.tar_single_file("../query.sql", b"select 1")


def test_tar_single_file_contains_0600_file():
    payload = transport.tar_single_file("query.sql", b"select 1")
    with tarfile.open(fileobj=BytesIO(payload), mode="r") as tar:
        member = tar.getmember("query.sql")
        assert member.mode == 0o600
        extracted = tar.extractfile(member)
        assert extracted is not None
        assert extracted.read() == b"select 1"


def test_psql_file_imuni_blocks_empty_sql():
    result = transport.psql_file_imuni("")
    assert result["ok"] is False
    assert result["blocked"] is True
    assert result["executed"] is False


def test_psql_file_imuni_uploads_sql_file_and_removes_it(monkeypatch):
    calls = []

    def fake_put(container, directory, filename, content, timeout=25):
        calls.append(("put", container, directory, filename, content))
        return {"ok": True}

    def fake_exec(container, cmd, timeout=25):
        calls.append(("exec", container, list(cmd)))
        return {"ok": True, "stdout": "ok=true", "exit_code": 0, "stderr_tail": ""}

    monkeypatch.setattr(transport, "put_text_file", fake_put)
    monkeypatch.setattr(transport, "docker_exec", fake_exec)

    result = transport.psql_file_imuni("select 1;", {"patient_code": "PAT-1"})

    assert result["ok"] is True
    assert result["executed"] is True
    assert result["secret_value_exposed"] is False
    assert calls[0][0] == "put"
    assert calls[0][4] == "select 1;"
    assert calls[1][0] == "exec"
    assert "-f" in calls[1][2]
    assert "select 1;" not in calls[1][2]
    assert calls[2][0] == "exec"
    assert calls[2][2][:2] == ["rm", "-f"]
