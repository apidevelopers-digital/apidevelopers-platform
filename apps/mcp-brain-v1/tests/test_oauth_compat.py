from __future__ import annotations

import base64
import hashlib
from urllib.parse import parse_qs, urlparse

from fastapi.testclient import TestClient

from app.entrypoint import app


def s256(value: str) -> str:
    return base64.urlsafe_b64encode(hashlib.sha256(value.encode("ascii")).digest()).rstrip(b"=").decode("ascii")


def test_oauth_metadata_documents(monkeypatch):
    monkeypatch.setenv("MCP_PUBLIC_BASE_URL", "https://mcp.apidevelopers.digital")
    client = TestClient(app)

    protected = client.get("/.well-known/oauth-protected-resource")
    assert protected.status_code == 200
    assert protected.json()["resource"] == "https://mcp.apidevelopers.digital"
    assert protected.json()["authorization_servers"] == ["https://mcp.apidevelopers.digital"]
    assert "juri.datajud.read" in protected.json()["scopes_supported"]

    oauth = client.get("/.well-known/oauth-authorization-server")
    assert oauth.status_code == 200
    assert oauth.json()["authorization_endpoint"] == "https://mcp.apidevelopers.digital/oauth/authorize"
    assert oauth.json()["token_endpoint_auth_methods_supported"] == ["none"]
    assert oauth.json()["code_challenge_methods_supported"] == ["S256"]


def test_oauth_register_and_unauthorized_datajud_call(monkeypatch):
    monkeypatch.setenv("MCP_PUBLIC_BASE_URL", "https://mcp.apidevelopers.digital")
    client = TestClient(app)

    register = client.post("/oauth/register", json={"client_name": "ChatGPT"})
    assert register.status_code == 200
    assert register.json()["client_id"].startswith("chatgpt-mcp-")

    unauthorized = client.post("/mcp/call", json={"tool": "juri.datajud.job.get", "arguments": {"jobId": "abc"}})
    assert unauthorized.status_code == 401
    assert "oauth-protected-resource" in unauthorized.headers["WWW-Authenticate"]


def test_oauth_code_flow_allows_datajud_tool(monkeypatch):
    monkeypatch.setenv("MCP_PUBLIC_BASE_URL", "https://mcp.apidevelopers.digital")
    monkeypatch.setenv("MCP_OAUTH_TOKEN_SIGNING_SECRET", "unit-test-secret")
    monkeypatch.setenv("MCP_OAUTH_CONNECT_CODE", "connect-123")

    import app.entrypoint as entrypoint

    def fake_call(tool, arguments):
        return {"tool": tool, "result": {"ok": True, "jobId": arguments["jobId"]}}

    monkeypatch.setattr(entrypoint, "call_juri_datajud_tool", fake_call)

    client = TestClient(app)
    verifier = "unit-test-verifier-12345"
    auth = client.post(
        "/oauth/authorize",
        data={
            "connect_code": "connect-123",
            "response_type": "code",
            "client_id": "chatgpt-client",
            "redirect_uri": "https://chat.openai.com/aip/callback",
            "state": "state-1",
            "scope": "mcp.read juri.datajud.read offline_access",
            "code_challenge": s256(verifier),
            "code_challenge_method": "S256",
        },
        follow_redirects=False,
    )
    assert auth.status_code == 302
    params = parse_qs(urlparse(auth.headers["location"]).query)
    assert params["state"] == ["state-1"]

    token = client.post(
        "/oauth/token",
        data={
            "grant_type": "authorization_code",
            "code": params["code"][0],
            "client_id": "chatgpt-client",
            "redirect_uri": "https://chat.openai.com/aip/callback",
            "code_verifier": verifier,
        },
    )
    assert token.status_code == 200
    access_token = token.json()["access_token"]

    call = client.post(
        "/mcp/call",
        headers={"Authorization": f"Bearer {access_token}"},
        json={"tool": "juri.datajud.job.get", "arguments": {"jobId": "job-123"}},
    )
    assert call.status_code == 200
    assert call.json()["result"]["ok"] is True


def test_legacy_admin_bearer_still_allows_datajud_tool(monkeypatch):
    monkeypatch.setenv("MCP_ADMIN_TOKEN", "legacy-admin-token")

    import app.entrypoint as entrypoint

    def fake_call(tool, arguments):
        return {"tool": tool, "result": {"ok": True, "status": "admin-ok"}}

    monkeypatch.setattr(entrypoint, "call_juri_datajud_tool", fake_call)

    client = TestClient(app)
    response = client.post(
        "/mcp/call",
        headers={"Authorization": "Bearer legacy-admin-token"},
        json={"tool": "juri.datajud.status", "arguments": {"dry_run": True}},
    )
    assert response.status_code == 200
    assert response.json()["result"]["status"] == "admin-ok"
