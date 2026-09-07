import React, { useMemo, useState } from "react";
import { createPublicResearchClient, PublicResearchError } from "./public-research-client.js";
import "./public-research.css";

const EXAMPLE = Object.freeze({
  title: "Pesquisa jurídica pública pronta para conexão",
  summary: "A interface agora aceita consultas reais e aguarda apenas a fachada pública server-side para acessar fontes abertas sem expor credenciais no navegador.",
  source: "Mitra Public Research",
  sourceUrl: "",
  citation: "Preview técnico — sem dados privados.",
  date: "",
});

function ResultCard({ item, index }) {
  return (
    <article className="result research-result">
      <div className="meta">
        <strong>{item.source || `Fonte ${index + 1}`}</strong>
        <span>{item.date || "fonte pública"}</span>
      </div>
      <h3>{item.title}</h3>
      {item.summary ? <p>{item.summary}</p> : null}
      <footer>
        <span>{item.citation || "Referência pública"}</span>
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">Abrir fonte ↗</a>
        ) : (
          <b>Fonte identificada</b>
        )}
      </footer>
    </article>
  );
}

export default function PublicResearchPanel({ Mark }) {
  const baseUrl = String(import.meta.env.VITE_MITRA_PUBLIC_API_BASE_URL || "").trim();
  const client = useMemo(() => createPublicResearchClient({ baseUrl }), [baseUrl]);
  const [query, setQuery] = useState("responsabilidade civil médica");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [results, setResults] = useState([EXAMPLE]);

  async function submit(event) {
    event.preventDefault();
    setMessage("");

    if (!query.trim()) {
      setStatus("error");
      setMessage("Digite um termo para pesquisar.");
      return;
    }

    setStatus("loading");

    try {
      const response = await client.search({ query, limit: 8 });
      setResults(response.results.length ? [...response.results] : []);
      setStatus("success");
      setMessage(
        response.results.length
          ? `${response.results.length} resultado(s) público(s) encontrado(s).`
          : "A pesquisa foi concluída, mas nenhuma fonte retornou resultado.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof PublicResearchError
          ? error.message
          : "A pesquisa pública não está disponível neste momento.",
      );
    }
  }

  return (
    <div className="console" id="demo">
      <div className="console-head">
        <span><Mark/> Pesquisa pública</span>
        <b>{client.configured ? "Mitra · conectável" : "Mitra · preview"}</b>
      </div>

      <form className="search research-search" onSubmit={submit}>
        <span aria-hidden="true">⌕</span>
        <input
          aria-label="Pesquisar fontes jurídicas públicas"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          maxLength={500}
          placeholder="Digite uma tese, tema, norma ou termo jurídico"
        />
        <button type="submit" disabled={status === "loading"} aria-label="Pesquisar">
          {status === "loading" ? "…" : "↵"}
        </button>
      </form>

      <div className="chips">
        <span>CNJ / DataJud</span>
        <span>Legislação</span>
        <span>Diário Oficial</span>
        <span>Proposições</span>
      </div>

      {message ? (
        <div className={`research-status ${status === "error" ? "is-error" : ""}`} role="status">
          {message}
        </div>
      ) : null}

      <div className="research-results">
        {results.length ? (
          results.map((item, index) => <ResultCard key={`${item.source}-${item.title}-${index}`} item={item} index={index} />)
        ) : (
          <div className="research-empty">Nenhum resultado público para exibir.</div>
        )}
      </div>

      {!client.configured ? (
        <div className="research-boundary">
          Integração server-side ainda não ativada neste ambiente. Nenhum bearer, cookie privado ou dado de cliente é enviado pelo navegador.
        </div>
      ) : null}
    </div>
  );
}
