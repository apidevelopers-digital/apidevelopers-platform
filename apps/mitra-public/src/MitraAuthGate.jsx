import React, { useMemo, useState } from "react";
import { createMitraAuthClient } from "./auth-client.js";
import "./auth.css";

function formatSafeError(err) {
  const message = String(err?.message || "Não foi possível autenticar.").trim();
  const code = String(err?.code || "").trim();
  const status = Number.isInteger(err?.status) && err.status > 0 ? err.status : null;
  const details = [
    code ? `código: ${code}` : "",
    status ? `status: ${status}` : "",
  ].filter(Boolean).join(" · ");
  return details ? `${message} (${details})` : message;
}

function safeLocationSnapshot() {
  if (typeof window === "undefined") {
    return Object.freeze({ href: "", origin: "", host: "", pathname: "" });
  }
  return Object.freeze({
    href: String(window.location?.href || ""),
    origin: String(window.location?.origin || ""),
    host: String(window.location?.host || ""),
    pathname: String(window.location?.pathname || ""),
  });
}

function makeBuildDiagnostic({ client, status, lastFailure }) {
  const location = safeLocationSnapshot();
  return Object.freeze({
    product: "product:mitra",
    app: "mitra-public",
    buildSha: String(
      import.meta.env.VITE_MITRA_BUILD_SHA ||
        import.meta.env.VITE_APP_SOURCE_SHA ||
        import.meta.env.VITE_GITHUB_SHA ||
        "unknown",
    ),
    buildTime: String(import.meta.env.VITE_MITRA_BUILD_TIME || import.meta.env.VITE_BUILD_TIME || "unknown"),
    loadedAt: new Date().toISOString(),
    browserHost: location.host,
    browserOrigin: location.origin,
    browserPath: location.pathname,
    gatewayBaseUrl: client.baseUrl || "",
    loginPath: client.loginPath,
    surfaceHost: client.surfaceHost,
    authClientConfigured: client.configured,
    uiStatus: status,
    lastFailure: lastFailure || null,
  });
}

async function copyDiagnostic(diagnostic) {
  const payload = JSON.stringify(diagnostic, null, 2);
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(payload);
    return true;
  }
  return false;
}

export default function MitraAuthGate({ children }) {
  const baseUrl = String(
    import.meta.env.VITE_MITRA_AUTH_BASE_URL ||
      import.meta.env.VITE_MITRA_PUBLIC_API_BASE_URL ||
      "",
  ).trim();
  const loginPath = String(
    import.meta.env.VITE_MITRA_AUTH_LOGIN_PATH ||
      "/v1/web-agent/session/login",
  ).trim();
  const surfaceHost = String(
    import.meta.env.VITE_MITRA_AUTH_SURFACE_HOST ||
      "",
  ).trim();

  const client = useMemo(
    () => createMitraAuthClient({ baseUrl, loginPath, surfaceHost }),
    [baseUrl, loginPath, surfaceHost],
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState(client.configured ? "idle" : "not_configured");
  const [error, setError] = useState("");
  const [lastFailure, setLastFailure] = useState(null);
  const [copyStatus, setCopyStatus] = useState("");

  const diagnostic = makeBuildDiagnostic({ client, status, lastFailure });

  async function submit(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    setLastFailure(null);
    setCopyStatus("");
    try {
      const next = await client.login({ email, password });
      setSession(next);
      setStatus("authenticated");
    } catch (err) {
      const failure = Object.freeze({
        code: String(err?.code || "unknown"),
        status: Number.isInteger(err?.status) ? err.status : 0,
        message: String(err?.message || "Não foi possível autenticar."),
        occurredAt: new Date().toISOString(),
      });
      setSession(null);
      setStatus("error");
      setLastFailure(failure);
      setError(formatSafeError(err));
    }
  }

  async function handleCopyDiagnostic() {
    try {
      const copied = await copyDiagnostic(diagnostic);
      setCopyStatus(copied ? "Diagnóstico copiado." : "Copie manualmente o JSON abaixo.");
    } catch {
      setCopyStatus("Copie manualmente o JSON abaixo.");
    }
  }

  if (session?.authenticated) {
    return (
      <div className="auth-shell is-authenticated">
        <div className="auth-session">
          <span>● Sessão profissional ativa</span>
          <small>
            Produto {session.productId}
            {session.expiresAt ? ` · expira em ${new Date(session.expiresAt).toLocaleString("pt-BR")}` : ""}
          </small>
        </div>
        {children}
      </div>
    );
  }

  return (
    <section className="auth-shell" id="login">
      <div className="auth-card">
        <span className="kicker">Acesso profissional</span>
        <h2>Entrar no Mitra Professional</h2>
        <p>
          A bancada profissional fica protegida por sessão real do Gateway. O frontend não cria sessão local falsa:
          ele só libera o uso depois de autenticação confirmada pelo backend.
        </p>

        <form className="auth-form" onSubmit={submit}>
          <label>
            E-mail
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <button className="primary" type="submit" disabled={status === "loading" || !client.configured}>
            {status === "loading" ? "Entrando..." : "Entrar e abrir bancada"}
          </button>
        </form>

        {status === "not_configured" ? (
          <p className="auth-warning">
            Login real ainda não está configurado neste build. Defina VITE_MITRA_AUTH_BASE_URL para ativar a chamada ao Gateway.
          </p>
        ) : null}
        {error ? <p className="auth-error">{error}</p> : null}

        <dl className="auth-contract">
          <div><dt>Produto esperado</dt><dd>product:mitra</dd></div>
          <div><dt>Host autorizado</dt><dd>{client.surfaceHost}</dd></div>
          <div><dt>Endpoint</dt><dd>{client.loginPath}</dd></div>
        </dl>

        <div className="auth-diagnostic-panel">
          <div className="auth-diagnostic-header">
            <div>
              <strong>Diagnóstico do preview</strong>
              <small>Use para diferenciar cache, bundle antigo e erro real do Gateway.</small>
            </div>
            <button type="button" className="secondary" onClick={handleCopyDiagnostic}>Copiar diagnóstico</button>
          </div>
          {copyStatus ? <p className="auth-copy-status">{copyStatus}</p> : null}
          <dl className="auth-diagnostic-grid">
            <div><dt>Build SHA</dt><dd>{diagnostic.buildSha}</dd></div>
            <div><dt>Carregado em</dt><dd>{diagnostic.loadedAt}</dd></div>
            <div><dt>Browser host</dt><dd>{diagnostic.browserHost}</dd></div>
            <div><dt>Gateway</dt><dd>{diagnostic.gatewayBaseUrl || "não configurado"}</dd></div>
            <div><dt>Surface</dt><dd>{diagnostic.surfaceHost}</dd></div>
            <div><dt>Status UI</dt><dd>{diagnostic.uiStatus}</dd></div>
            <div><dt>Último erro</dt><dd>{lastFailure ? `${lastFailure.code} · ${lastFailure.status}` : "nenhum"}</dd></div>
          </dl>
          <details>
            <summary>Ver JSON seguro</summary>
            <pre>{JSON.stringify(diagnostic, null, 2)}</pre>
          </details>
        </div>
      </div>
    </section>
  );
}
