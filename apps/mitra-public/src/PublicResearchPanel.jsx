import React, { useMemo, useState } from "react";
import { createPublicResearchClient, PublicResearchError } from "./public-research-client.js";
import "./public-research.css";

const EXAMPLE_RESULTS = Object.freeze([
  Object.freeze({
    id: "preview-lexml",
    title: "Pesquisa jurídica pública conectada ao LexML e DataJud/CNJ",
    summary:
      "A interface consulta uma fachada server-side segura. O navegador não recebe token MCP, API key, tenant id ou credenciais privadas.",
    source: "Mitra · Preview",
    sourceUrl: "",
    citation: "LexML + DataJud/CNJ · read-only",
    court: "STJ",
    date: "",
  }),
]);

const TRIBUNALS = Object.freeze([
  ["STJ", "STJ"],
  ["TJSP", "TJSP"],
  ["TRF1", "TRF1"],
  ["TRF2", "TRF2"],
  ["TRF3", "TRF3"],
  ["TRF4", "TRF4"],
  ["TRF5", "TRF5"],
  ["TRF6", "TRF6"],
  ["TST", "TST"],
  ["TSE", "TSE"],
  ["STM", "STM"],
]);

function ResultCard({ item, index }) {
  const source = item.source || `Fonte ${index + 1}`;
  const citation = item.citation || [source, item.court, item.date].filter(Boolean).join(" · ");

  return (
    <article className="result research-result">
      <div className="meta research-result__meta">
        <strong>{source}</strong>
        <span>{item.date || item.court || "fonte pública"}</span>
      </div>

      <h3>{item.title}</h3>

      {item.summary ? <p>{item.summary}</p> : null}

      <footer>
        <span>{citation || "Referência pública"}</span>
        {item.sourceUrl ? (
          <a href={item.sourceUrl} target="_blank" rel="noreferrer">
            Abrir fonte ↗
          </a>
        ) : (
          <b>Fonte identificada</b>
        )}
      </footer>
    </article>
  );
}

function SourceBadge({ children }) {
  return <span className="research-source-badge">{children}</span>;
}

export default function PublicResearchPanel({ Mark }) {
  const baseUrl = String(import.meta.env.VITE_MITRA_PUBLIC_API_BASE_URL || "").trim();
  const endpointPath = String(import.meta.env.VITE_MITRA_PUBLIC_JURISPRUDENCIA_ENDPOINT || "").trim();

  const client = useMemo(
    () => createPublicResearchClient({ baseUrl, endpointPath }),
    [baseUrl, endpointPath],
  );

  const [query, setQuery] = useState("direito civil");
  const [tribunal, setTribunal] = useState("STJ");
  const [limit, setLimit] = useState(8);
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("Pronta para consultar fontes públicas oficiais.");
  const [results, setResults] = useState(EXAMPLE_RESULTS);

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
      const response = await client.search({
        query,
        tribunal,
        limit,
        periodFrom,
        periodTo,
      });

      const nextResults = response.results.length ? [...response.results] : [];
      setResults(nextResults);
      setStatus("success");
      setMessage(
        nextResults.length
          ? `${nextResults.length} resultado(s) público(s) encontrado(s) em ${response.source || "fontes oficiais"}.`
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
    <div className="console research-console" id="demo">
      <div className="console-head">
        <span><Mark /> Jurisprudência pública</span>
        <b>{status === "loading" ? "Consultando fontes…" : "LexML · DataJud/CNJ"}</b>
      </div>

      <form className="research-form" onSubmit={submit}>
        <label className="research-field research-field--wide">
          <span>Tema, tese, norma ou termo jurídico</span>
          <input
            aria-label="Pesquisar fontes jurídicas públicas"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={500}
            placeholder="Ex.: responsabilidade civil médica"
          />
        </label>

        <label className="research-field">
          <span>Tribunal</span>
          <select value={tribunal} onChange={(event) => setTribunal(event.target.value)}>
            {TRIBUNALS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>

        <label className="research-field">
          <span>Limite</span>
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {[3, 5, 8, 10, 20].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
        </label>

        <label className="research-field">
          <span>De</span>
          <input
            type="date"
            value={periodFrom}
            onChange={(event) => setPeriodFrom(event.target.value)}
          />
        </label>

        <label className="research-field">
          <span>Até</span>
          <input
            type="date"
            value={periodTo}
            onChange={(event) => setPeriodTo(event.target.value)}
          />
        </label>

        <button type="submit" disabled={status === "loading"} aria-label="Pesquisar jurisprudência pública">
          {status === "loading" ? "Pesquisando…" : "Pesquisar"}
        </button>
      </form>

      <div className="research-sources" aria-label="Fontes públicas conectadas">
        <SourceBadge>LexML</SourceBadge>
        <SourceBadge>DataJud/CNJ</SourceBadge>
        <SourceBadge>Read-only</SourceBadge>
        <SourceBadge>Sem token no navegador</SourceBadge>
      </div>

      {message ? (
        <div className={`research-status ${status === "error" ? "is-error" : ""}`} role="status">
          {message}
        </div>
      ) : null}

      <div className="research-results">
        {results.length ? (
          results.map((item, index) => (
            <ResultCard
              key={`${item.source || "source"}-${item.id || item.title || index}`}
              item={item}
              index={index}
            />
          ))
        ) : (
          <div className="research-empty">Nenhum resultado público para exibir.</div>
        )}
      </div>

      <div className="research-boundary">
        A busca usa uma fachada server-side segura. Tokens MCP, tenant id, API keys e credenciais de provedores não são expostos no JavaScript público.
      </div>
    </div>
  );
}
