from __future__ import annotations
import base64, hashlib, hmac, json, os, secrets, time
from urllib.parse import urlencode, parse_qs
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse

ALLOWED_TOOLS = {"juri.datajud.status", "juri.datajud.request", "juri.datajud.job.get"}
SCOPES = ("mcp.read", "juri.datajud.read", "offline_access")

def b64e(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")

def b64d(value: str) -> bytes:
    return base64.urlsafe_b64decode((value + "=" * (-len(value) % 4)).encode("ascii"))

def base_url(request: Request | None = None) -> str:
    return (os.environ.get("MCP_PUBLIC_BASE_URL") or (str(request.base_url).rstrip("/") if request else "https://mcp.apidevelopers.digital")).rstrip("/")

def resource_url(request: Request | None = None) -> str:
    return os.environ.get("MCP_OAUTH_RESOURCE") or base_url(request)

def secret() -> bytes:
    value = os.environ.get("MCP_OAUTH_TOKEN_SIGNING_SECRET") or os.environ.get("MCP_BRAIN_ADMIN_TOKEN") or os.environ.get("MCP_ADMIN_TOKEN")
    if not value:
        raise HTTPException(status_code=503, detail="mcp_oauth_signing_secret_not_configured")
    return value.encode("utf-8")

def sign(payload: dict) -> str:
    body = b64e(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = hmac.new(secret(), body.encode(), hashlib.sha256).digest()
    return f"{body}.{b64e(sig)}"

def verify(token: str, kind: str) -> dict:
    try:
        body, sig = token.split(".", 1)
        expected = hmac.new(secret(), body.encode(), hashlib.sha256).digest()
        if not hmac.compare_digest(expected, b64d(sig)):
            raise ValueError("bad signature")
        payload = json.loads(b64d(body).decode())
    except Exception as exc:
        raise HTTPException(status_code=401, detail="invalid_oauth_token") from exc
    if payload.get("kind") != kind or int(payload.get("exp", 0)) < int(time.time()):
        raise HTTPException(status_code=401, detail="invalid_oauth_token")
    return payload

def s256(verifier: str) -> str:
    return b64e(hashlib.sha256(verifier.encode("ascii")).digest())

def scope(value: str | None) -> str:
    requested = (value or " ".join(SCOPES)).split()
    allowed = [s for s in requested if s in SCOPES]
    return " ".join(allowed or SCOPES)

def metadata(request: Request) -> dict:
    b = base_url(request)
    return {
        "issuer": b,
        "authorization_endpoint": f"{b}/oauth/authorize",
        "token_endpoint": f"{b}/oauth/token",
        "registration_endpoint": f"{b}/oauth/register",
        "response_types_supported": ["code"],
        "grant_types_supported": ["authorization_code", "refresh_token"],
        "code_challenge_methods_supported": ["S256"],
        "token_endpoint_auth_methods_supported": ["none"],
        "scopes_supported": list(SCOPES),
        "authorization_response_iss_parameter_supported": True,
    }

def unauthorized(request: Request | None = None) -> HTTPException:
    b = base_url(request)
    return HTTPException(
        status_code=401,
        detail="mcp_oauth_required",
        headers={"WWW-Authenticate": f'Bearer resource_metadata="{b}/.well-known/oauth-protected-resource", scope="mcp.read juri.datajud.read"'},
    )

def legacy_ok(authorization: str | None) -> bool:
    if not authorization or not authorization.lower().startswith("bearer "):
        return False
    token = authorization.split(" ", 1)[1].strip()
    expected = os.environ.get("MCP_BRAIN_ADMIN_TOKEN") or os.environ.get("MCP_ADMIN_TOKEN")
    return bool(expected and hmac.compare_digest(token, expected))

def verify_mcp_oauth_authorization(tool: str, authorization: str | None, request: Request | None = None) -> dict | None:
    if tool not in ALLOWED_TOOLS:
        return None
    if legacy_ok(authorization):
        return {"sub": "legacy-admin", "scope": "admin"}
    if not authorization or not authorization.lower().startswith("bearer "):
        raise unauthorized(request)
    payload = verify(authorization.split(" ", 1)[1].strip(), "access")
    scopes = set(str(payload.get("scope", "")).split())
    if "mcp.read" not in scopes or "juri.datajud.read" not in scopes:
        raise HTTPException(status_code=403, detail="mcp_oauth_scope_required")
    return payload

def auth_code(data: dict[str, str]) -> str:
    now = int(time.time())
    return sign({
        "kind": "code",
        "iat": now,
        "exp": now + 300,
        "nonce": secrets.token_urlsafe(12),
        "client_id": data["client_id"],
        "redirect_uri": data["redirect_uri"],
        "scope": scope(data.get("scope")),
        "resource": data.get("resource") or resource_url(),
        "code_challenge": data.get("code_challenge"),
        "code_challenge_method": data.get("code_challenge_method") or "S256",
    })

def redirect_code(data: dictstr, str]) -> RedirectResponse:
    params = {"code": auth_code(data), "iss": base_url()}
    if data.get("state"):
        params["state"] = data["state"]
    joiner = "&" if "?" in data["redirect_uri"] else "?"
    return RedirectResponse(f"{data['redirect_uri']}{joiner}{urlencode(params)}", status_code=302)

def install_oauth_compat_routes(app: FastAPI) -> None:
    @app.get("/.well-known/oauth-protected-resource")
    def protected_resource(request: Request):
        b = base_url(request)
        return {"resource": resource_url(request), "authorization_servers": [b], "scopes_supported": ["mcp.read", "juri.datajud.read"], "bearer_methods_supported": ["header"], "resource_name": "ADA Enterprise MCP Brain"}

    @app.get("/.well-known/oauth-authorization-server")
    def auth_server(request: Request):
        return metadata(request)

    @app.get("/.well-known/openid-configuration")
    def oidc(request: Request):
        data = metadata(request)
        data["subject_types_supported"] = ["public"]
        data["id_token_signing_alg_values_supported"] = ["none"]
        return data

    @app.post("/oauth/register")
    async def register(request: Request):
        raw = await request.body()
        body = json.loads(raw.decode() or "{}") if raw else {}
        return {"client_id": "chatgpt-mcp-" + secrets.token_urlsafe(12), "client_id_issued_at": int(time.time()), "client_name": body.get("client_name", "ChatGPT MCP Client"), "redirect_uris": body.get("redirect_uris", []), "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"], "token_endpoint_auth_method": "none", "scope": " ".join(SCOPES)}

    @app.get("/oauth/authorize")
    def authorize_get(request: Request):
        q = dict(request.query_params)
        if q.get("response_type") != "code" or not q.get("client_id") or not q.get("redirect_uri"):
            raise HTTPException(status_code=400, detail="invalid_request")
        if os.environ.get("MCP_OAUTH_AUTO_APPROVE") == "true":
            return redirect_code(q)
        hidden = "".join(f'<input type="hidden" name="{k}" value="{v}">' for k, v in q.items())
        return HTMLResponse(f"<form method='post' action='/oauth/authorize'>{hidden}<input name='connect_code' type='password'><button>Authorize</button></form>")

    @app.post("/oauth/authorize")
    async def authorize_post(request: Request):
        form = {k: v[-1] for k, v in parse_qs((await request.body()).decode(), keep_blank_values=True).items()}
        expected = os.environ.get("MCP_OAUTH_CONNECT_CODE")
        if not expected:
            raise HTTPException(status_code=503, detail="mcp_oauth_connect_code_not_configured")
        if not hmac.compare_digest(form.get("connect_code", ""), expected):
            raise HTTPException(status_code=403, detail="invalid_connect_code")
        if not form.get("client_id") or not form.get("redirect_uri"):
            raise HTTPException(status_code=400, detail="invalid_request")
        return redirect_code(form)

    @app.post("/oauth/token")
    async def token(request: Request):
        form = {k: v[-1] for k, v in parse_qs((await request.body()).decode(), keep_blank_values=True).items()}
        now = int(time.time())
        if form.get("grant_type") == "authorization_code":
            code = verify(form.get("code", ""), "code")
            if form.get("client_id") and form["client_id"] != code.get("client_id"):
                raise HTTPException(status_code=400, detail="invalid_client_id")
            if form.get("redirect_uri") and form["redirect_uri"] != code.get("redirect_uri"):
                raise HTTPException(status_code=400, detail="invalid_redirect_uri")
            if code.get("code_challenge") and (not form.get("code_verifier") or s256(form["code_verifier"]) != code.get("code_challenge")):
                raise HTTPException(status_code=400, detail="invalid_pkce_verifier")
            sc = scope(code.get("scope"))
            access = {"kind": "access", "iat": now, "exp": now + 3600, "sub": "chatgpt-mcp", "client_id": code.get("client_id"), "scope": sc, "resource": code.get("resource") or resource_url(request)}
            refresh = {"kind": "refresh", "iat": now, "exp": now + 2592000, "sub": "chatgpt-mcp", "client_id": code.get("client_id"), "scope": sc, "resource": access["resource"]}
            return JSONResponse({"access_token": sign(access), "token_type": "Bearer", "expires_in": 3600, "refresh_token": sign(refresh), "scope": sc})
        if form.get("grant_type") == "refresh_token":
            refresh = verify(form.get("refresh_token", ""), "refresh")
            sc = scope(refresh.get("scope"))
            access = {"kind": "access", "iat": now, "exp": now + 3600, "sub": refresh.get("sub", "chatgpt-mcp"), "client_id": refresh.get("client_id"), "scope": sc, "resource": refresh.get("resource") or resource_url(request)}
            return JSONResponse({"access_token": sign(access), "token_type": "Bearer", "expires_in": 3600, "refresh_token": form.get("refresh_token"), "scope": sc})
        raise HTTPException(status_code=400, detail="unsupported_grant_type")
