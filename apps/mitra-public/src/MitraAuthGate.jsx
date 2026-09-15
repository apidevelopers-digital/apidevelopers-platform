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

  async function submit(event) {
    event.preventDefault();
    setStatus("loading");
    setError("");
    try {
      const next = await client.login({ email, password });
      setSession(next);
      setStatus("authenticated");
    } catch (err) {
      setSession(null);
      setStatus("error");
      setError(formatSafeError(err));
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
      </div>
    </section>
  );
}
