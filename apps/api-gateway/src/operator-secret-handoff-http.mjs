const ROUTE_PATTERN = /^\/v1\/operator\/secret-handoff\/([A-Za-z0-9._:-]{3,128})\/submit$/;
export const OPERATOR_SECRET_HANDOFF_SCOPE = "admin:*";

const RESPONSE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(payload),
  });
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

function hasAdminWildcard(identity) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes(OPERATOR_SECRET_HANDOFF_SCOPE);
}

function mapSubmitFailure(code) {
  if (code === "secret_handoff_not_found") return 404;
  if (code === "secret_handoff_expired") return 410;
  if (code === "secret_handoff_consumed" || code === "secret_handoff_already_submitted") return 409;
  if (code === "secret_handoff_token_invalid") return 401;
  if (code === "secret_handoff_secret_required" || code === "secret_handoff_secret_too_large") return 400;
  return 503;
}

export function createOperatorSecretHandoffHttpApp({
  app,
  authenticator,
  authorization,
  handoffService,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate is required");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide is required");
  if (typeof handoffService?.submit !== "function") throw new TypeError("handoffService.submit is required");

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(request.url ?? "/", "https://api-gateway.local");
      const match = ROUTE_PATTERN.exec(parsedUrl.pathname);
      if (!match) return app.handleRequest(request);
      if (method !== "POST") return jsonResponse(405, { ok: false, error: "method_not_allowed" });

      const identity = await authenticator.authenticate(request.headers ?? {});
      if (!identity) return jsonResponse(401, { ok: false, error: "unauthorized" });

      const sessionId = match[1];
      const authorizationDecision = authorization.decide({
        identity,
        action: "operator.secret-handoff.submit",
        resource: `institution:secret-handoff:${sessionId}`,
        requiredScopes: [OPERATOR_SECRET_HANDOFF_SCOPE],
      });
      if (authorizationDecision?.effect !== "allow" || !hasAdminWildcard(identity)) {
        return jsonResponse(403, { ok: false, error: "forbidden" });
      }

      const contentType = readHeader(request.headers, "content-type")?.split(";", 1)[0]?.trim().toLowerCase();
      if (contentType !== "application/octet-stream") {
        return jsonResponse(415, { ok: false, error: "application_octet_stream_required" });
      }

      const submitToken = readHeader(request.headers, "x-secret-handoff-token");
      if (!submitToken) return jsonResponse(400, { ok: false, error: "secret_handoff_token_required" });

      if (!(request.body instanceof Uint8Array) || request.body.byteLength === 0) {
        return jsonResponse(400, { ok: false, error: "secret_handoff_binary_body_required" });
      }

      const bodyBytes = Buffer.from(request.body);
      try {
        const result = handoffService.submit({
          sessionId,
          submitToken,
          secret: bodyBytes,
        });
        if (!result.ok) return jsonResponse(mapSubmitFailure(result.code), { ok: false, error: result.code });
        return jsonResponse(202, {
          ok: true,
          sessionId: result.sessionId,
          state: result.state,
          expiresAt: result.expiresAt,
          secretReturned: false,
        });
      } finally {
        bodyBytes.fill(0);
        if (Buffer.isBuffer(request.body)) request.body.fill(0);
      }
    },
  });
}
