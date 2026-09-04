import { BrowserSessionHandoffError } from "@apidevelopers/auth-core/browser-session-handoff";

export const browserSessionHandoffIssuePath = "/v1/browser-session/handoff/issue";
export const browserSessionHandoffRedeemPath = "/v1/browser-session/handoff/redeem";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
});

function response(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function parseJsonBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim() === "") {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  return parsed;
}

function safeFailure(error) {
  if (error instanceof BrowserSessionHandoffError) {
    return {
      status: [400, 401, 403, 503].includes(error.status) ? error.status : 503,
      code: error.code,
    };
  }

  if (error?.status === 400) return { status: 400, code: "invalid_json" };
  return { status: 503, code: "browser_session_handoff_unavailable" };
}

async function requireRedeemerAuthentication(authenticator, headers) {
  const auth = await authenticator.authenticate(headers);
  if (!auth || auth.role !== "server") {
    throw new BrowserSessionHandoffError("handoff_redeemer_unauthorized", { status: 401 });
  }

  const principal = auth.principal;
  if (!principal || typeof principal !== "object") {
    throw new BrowserSessionHandoffError("handoff_redeemer_unauthorized", { status: 401 });
  }

  const id = typeof principal.id === "string" ? principal.id.trim() : "";
  if (!id) {
    throw new BrowserSessionHandoffError("handoff_redeemer_unauthorized", { status: 401 });
  }

  return Object.freeze({ id });
}

export function createBrowserSessionHandoffHttpApp({
  app,
  handoffService,
  redeemerAuthenticator,
  redeemTargetOrigin,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }

  const dependenciesReady =
    typeof handoffService?.issue === "function" &&
    typeof handoffService?.redeem === "function" &&
    typeof redeemerAuthenticator?.authenticate === "function" &&
    typeof redeemTargetOrigin === "string" &&
    redeemTargetOrigin.trim();

  if (!dependenciesReady) {
    return Object.freeze({
      enabled: false,
      app,
    });
  }

  const wrapped = Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      ).pathname;

      if (
        method !== "POST" ||
        (pathname !== browserSessionHandoffIssuePath &&
          pathname !== browserSessionHandoffRedeemPath)
      ) {
        return app.handleRequest(request);
      }

      try {
        const payload = parseJsonBody(request.body);

        if (pathname === browserSessionHandoffIssuePath) {
          const issued = await handoffService.issue({
            headers: request.headers ?? {},
            targetOrigin: payload.targetOrigin,
            codeChallenge: payload.codeChallenge,
          });

          return response(200, {
            ok: true,
            handoff: {
              version: issued.version,
              code: issued.code,
              targetOrigin: issued.targetOrigin,
              expiresAt: issued.expiresAt,
            },
          });
        }

        await requireRedeemerAuthentication(
          redeemerAuthenticator,
          request.headers ?? {},
        );

        const redeemed = await handoffService.redeem({
          code: payload.code,
          targetOrigin: redeemTargetOrigin,
          codeVerifier: payload.codeVerifier,
        });

        return response(200, {
          ok: true,
          authenticated: true,
          principal: redeemed.principal,
          source: redeemed.source,
        });
      } catch (error) {
        const failure = safeFailure(error);
        return response(failure.status, {
          ok: false,
          authenticated: false,
          error: failure.code,
        });
      }
    },
  });

  return Object.freeze({
    enabled: true,
    app: wrapped,
  });
}
