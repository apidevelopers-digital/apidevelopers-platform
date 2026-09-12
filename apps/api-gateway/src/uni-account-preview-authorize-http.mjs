import { BrowserSessionHandoffError } from "@apidevelopers/auth-core/browser-session-handoff";

export const uniAccountPreviewAuthorizePath = "/v1/uni/account/handoff/authorize";
export const uniAccountPreviewTargetOrigin = "https://uni-preview.apidevelopers.digital";
export const uniAccountPreviewCallbackUrl =
  "https://uni-preview.apidevelopers.digital/api/account-handoff-callback.php";

const STATE = /^[A-Za-z0-9_-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const FORM_HEADERS = Object.freeze({
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
});
const REDIRECT_HEADERS = Object.freeze({
  "cache-control": "no-store, max-age=0",
  pragma: "no-cache",
  "referrer-policy": "no-referrer",
});

function response(status, headers = {}, body = "") {
  return Object.freeze({
    status,
    headers: Object.freeze({ ...headers }),
    body,
  });
}

function parseAuthorizeRequest(url) {
  const parsed = new URL(String(url ?? "/"), "https://gateway.apidevelopers.digital");
  const state = String(parsed.searchParams.get("state") ?? "").trim();
  const codeChallenge = String(parsed.searchParams.get("code_challenge") ?? "").trim();

  if (!STATE.test(state) || !CHALLENGE.test(codeChallenge)) {
    const error = new Error("invalid_handoff_request");
    error.status = 400;
    throw error;
  }

  return Object.freeze({ state, codeChallenge });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function loginForm({ state, codeChallenge }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Entrar na Conta uni.</title>
</head>
<body>
<main>
<h1>Entrar na Conta uni.</h1>
<p>Autentique-se para continuar para sua conta.</p>
<form method="post" action="${uniAccountPreviewAuthorizePath}">
<input type="hidden" name="state" value="${escapeHtml(state)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(codeChallenge)}">
<label>E-mail <input type="email" name="email" autocomplete="username" required></label>
<label>Senha <input type="password" name="password" autocomplete="current-password" required></label>
<button type="submit">Entrar</button>
</form>
</main>
</body>
</html>`;
}

function parseForm(body) {
  if (typeof body !== "string") {
    const error = new Error("invalid_login_form");
    error.status = 400;
    throw error;
  }
  const form = new URLSearchParams(body);
  return Object.freeze({
    state: String(form.get("state") ?? "").trim(),
    codeChallenge: String(form.get("code_challenge") ?? "").trim(),
    email: String(form.get("email") ?? "").trim(),
    password: String(form.get("password") ?? ""),
  });
}

function authorizeUrl({ state, codeChallenge }) {
  const query = new URLSearchParams({
    state,
    code_challenge: codeChallenge,
  });
  return `${uniAccountPreviewAuthorizePath}?${query.toString()}`;
}

function callbackUrl({ state, code }) {
  const target = new URL(uniAccountPreviewCallbackUrl);
  target.searchParams.set("code", code);
  target.searchParams.set("state", state);
  return target.toString();
}

function safeFailure(error) {
  if (error instanceof BrowserSessionHandoffError) {
    if (error.code === "source_session_required") {
      return Object.freeze({ status: 401, code: error.code });
    }
    return Object.freeze({
      status: [400, 401, 403, 503].includes(error.status) ? error.status : 503,
      code: error.code,
    });
  }
  if (error?.status === 400) return Object.freeze({ status: 400, code: String(error.message ?? "invalid_request") });
  return Object.freeze({ status: 503, code: "uni_account_authorize_unavailable" });
}

export function createUniAccountPreviewAuthorizeHttpApp({
  app,
  loginBootstrap,
  handoffService,
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }
  if (typeof loginBootstrap?.login !== "function") {
    throw new TypeError("loginBootstrap.login is required");
  }
  if (typeof handoffService?.issue !== "function") {
    throw new TypeError("handoffService.issue is required");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(
        String(request.url ?? "/"),
        "https://gateway.apidevelopers.digital",
      );

      if (parsedUrl.pathname !== uniAccountPreviewAuthorizePath) {
        return app.handleRequest(request);
      }

      if (method === "POST") {
        try {
          const form = parseForm(request.body);
          const { state, codeChallenge } = parseAuthorizeRequest(
            authorizeUrl({ state: form.state, codeChallenge: form.codeChallenge }),
          );
          if (!form.email || !form.password) {
            const error = new Error("invalid_login_form");
            error.status = 400;
            throw error;
          }

          const login = await loginBootstrap.login({
            host: "uni-preview.apidevelopers.digital",
            email: form.email,
            password: form.password,
          });

          return response(
            303,
            {
              ...REDIRECT_HEADERS, 
              location: authorizeUrl({ state, codeChallenge }),
              "set-cookie": login.setCookie,
            },
            "",
          );
        } catch (error) {
          const failure = safeFailure(error);
          return response(
            failure.status,
            { ...FORM_HEADERS, "content-type": "application/json; charset=utf-8" },
            JSON.stringify({ ok: false, authenticated: false, error: failure.code }),
          );
        }
      }

      if (method !== "GET") {
        return response(405, { ...FORM_HEADERS,  allow: "GET, POST" }, "Método não permitido.");
      }

      let handoff;
      try {
        handoff = parseAuthorizeRequest(request.url);
      } catch (error) {
        const failure = safeFailure(error);
        return response(
          failure.status,
          { ...FORM_HEADERS, "content-type": "application/json; charset=utf-8" },
          JSON.stringify({ ok: false, error: failure.code }),
        );
      }

      try {
        const issued = await handoffService.issue({
          headers: request.headers ?? {},
          targetOrigin: uniAccountPreviewTargetOrigin,
          codeChallenge: handoff.codeChallenge,
        });

        return response(
          303,
          {
            ...REDIRECT_HEADERS, 
            location: callbackUrl({ state: handoff.state, code: issued.code }),
          },
          "",
        );
      } catch (error) {
        const failure = safeFailure(error);
        if (failure.code === "source_session_required") {
          return response(200, FORM_HEADERS, loginForm(handoff));
        }
        return response(
          failure.status,
          { ...FORM_HEADERS, "content-type": "application/json; charset=utf-8" },
          JSON.stringify({ ok: false, authenticated: false, error: failure.code }),
        );
      }
    },
  });
}
