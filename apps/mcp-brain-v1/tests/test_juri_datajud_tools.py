from __future__ import annotations

from app.tools import juri_datajud_tools as datajud


def test_juri_datajud_definitions_are_registered():
    names = {tool["name"] for tool in datajud.JURI_DATAJUD_TOOL_DEFINITIONS}

    assert names == {
        "juri.datajud.status",
        "juri.datajud.smoke",
        "juri.datajud.request",
        "juri.datajud.job.get",
    }


def test_juri_datajud_job_get_requires_job_id():
    result = datajud.call_juri_datajud_tool("juri.datajud.job.get", {})

    assert result["result"]["ok"] is False
    assert result["result"]["error"] == "job_id_required"
    assert result["result"]["secretExposed"] is False
    assert result["result"]["rawResultIncluded"] is False


def test_juri_datajud_request_uses_gateway_contract(monkeypatch):
    captured = {}

    def fake_post_gateway_call(tool, payload, timeout_seconds):
        captured["tool"] = tool
        captured["payload"] = payload
        captured["timeout_seconds"] = timeout_seconds
        return {"tool": tool, "result": {"ok": True, "status": "accepted"}}

    monkeypatch.setattr(datajud, "_post_gateway_call", fake_post_gateway_call)

    result = datajud.call_juri_datajud_tool(
        "juri.datajud.request",
        {
            "tribunalAlias": "trf1",
            "cnjNumber": "00008323520184013202",
            "timeoutMs": 30000,
        },
    )

    assert result["result"]["ok"] is True
    assert captured["tool"] == "juri.datajud.request"
    assert captured["payload"] == {
        "tribunalAlias": "trf1",
        "cnjNumber": "00008323520184013202",
        "timeoutMs": 30000,
    }
    assert captured["timeout_seconds"] == 30
