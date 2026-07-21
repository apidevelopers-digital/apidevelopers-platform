import { ReadApiClient } from "./api-client.js";
import { loadProjections } from "./projection-loader.js";

const byId = (id) => document.getElementById(id);
const array = (value) => Array.isArray(value) ? value : [];
const value = (input) => input == null || input === "" ? "—" : String(input);

function entry(title, body, badge = "") {
  const node = document.createElement("div");
  node.className = "item";
  const heading = document.createElement("strong");
  heading.textContent = badge ? `${badge} · ${value(title)}` : value(title);
  const detail = document.createElement("div");
  detail.className = "muted";
  detail.textContent = value(body);
  node.append(heading, detail);
  return node;
}

function list(id, items, empty, map) {
  const target = byId(id);
  target.replaceChildren();
  if (!items.length) target.append(entry(empty, "Estado vazio legítimo."));
  else items.forEach((item) => target.append(map(item)));
}

function state(kind, title, message) {
  const node = byId("globalState");
  node.className = `card wide state ${kind}`.trim();
  node.replaceChildren();
  const heading = document.createElement("h2");
  const detail = document.createElement("p");
  heading.textContent = title;
  detail.textContent = message;
  node.append(heading, detail);
}

function renderInstitutional(data) {
  const records = array(data.records);
  const modules = array(data.modules);
  const versions = array(data.versions);
  const summary = data.summary || {};
  const integrity = data.integrity || {};
  const meta = data.meta || {};

  byId("summaryTitle").textContent = value(summary.title || "Resumo institucional");
  byId("summaryText").textContent = value(summary.description || summary.status || "Projeção institucional carregada.");
  byId("recordsCount").textContent = records.length;
  byId("modulesCount").textContent = modules.length;
  byId("versionsCount").textContent = versions.length;

  list("recordsList", records, "Nenhum registro projetado", (item) =>
    entry(item.title || item.label || item.id, item.summary || item.status || "Registro derivado"));
  list("modulesList", modules, "Nenhum módulo projetado", (item) =>
    entry(item.title || item.label || item.id, item.summary || item.status || "Módulo derivado"));

  const sources = [{ title: "Integridade", body: integrity.status || "unknown" },
    ...array(integrity.sources).map((source) => ({
      title: source.label || source.id,
      body: source.version || "fonte canônica",
    }))];
  list("integrityPanel", sources, "Origem não informada", (item) => entry(item.title, item.body));

  byId("projectionBadge").textContent = meta.stale
    ? "Potencialmente desatualizado"
    : `Projeção ${value(meta.projectionVersion || "carregada")}`;

  const trace = [
    ["Versão da projeção", meta.projectionVersion],
    ["Contrato", meta.contractVersion],
    ["Projetor", meta.projector],
    ["Gerado em", meta.generatedAt],
    ["Correlação", meta.correlationId],
  ];
  list("traceabilityPanel", trace, "Metadados não informados", ([title, body]) => entry(title, body));
}

function renderLearning(data) {
  const memories = array(data.memories);
  const findings = array(data.findings);
  const proposals = array(data.proposals);
  const evidence = array(data.evidence);

  list("learningPreview", [...memories.slice(0, 2), ...findings.slice(0, 3)], "Sem aprendizado recente",
    (item) => entry(item.title || item.label || item.id, item.summary || item.description || "Leitura derivada"));
  list("findingsList", [...memories, ...findings], "Sem memórias ou achados",
    (item) => entry(item.title || item.label || item.id, item.summary || item.description || "Leitura derivada"));
  list("proposalsList", proposals, "Sem propostas",
    (item) => entry(item.title || item.id, item.summary || "Proposta derivada",
      item.status === "approved" ? "Aprovada externamente" : "Não aprovada"));
  list("evidenceList", evidence, "Sem evidências",
    (item) => entry(item.title || item.id, item.summary || item.uri || "Evidência rastreável"));
}

function resultText(name, result) {
  if (result.ok) return `${name}: disponível`;
  if (result.error?.policy) return `${name}: acesso restrito`;
  if (result.error?.code === "REQUEST_TIMEOUT") return `${name}: tempo limite excedido`;
  if (result.error?.code === "REQUEST_CANCELLED") return `${name}: leitura cancelada`;
  return `${name}: indisponível`;
}

async function loadAll() {
  const button = byId("loadButton");
  button.disabled = true;
  state("", "Carregando projeções", "Consultando APIs de leitura pelo gateway.");

  const client = new ReadApiClient({
    baseUrl: byId("baseUrl").value,
    apiKey: byId("apiKey").value,
    timeoutMs: 8000,
  });

  try {
    const result = await loadProjections(client);
    if (result.institutional.ok) renderInstitutional(result.institutional.data);
    if (result.learning.ok) renderLearning(result.learning.data);

    const details = `${resultText("Institucional", result.institutional)} · ${resultText("Aprendizado", result.learning)}`;
    if (result.summary.kind === "ready") state("", "Leitura disponível", `${details}. Nenhuma mutação foi executada.`);
    else if (result.summary.kind === "partial") state("warn", "Leitura parcial", `${details}. Os dados disponíveis foram preservados.`);
    else if (result.summary.kind === "policy") state("warn", "Sem permissão ou bloqueado por política", "Nenhum objeto protegido foi revelado.");
    else state("error", "Projeções indisponíveis", `${details}. Tente novamente quando o gateway estiver disponível.`);

    if (result.summary.kind === "partial") byId("projectionBadge").textContent = "Disponibilidade parcial";
  } catch {
    state("error", "Falha inesperada", "A leitura não pôde ser concluída. Nenhum detalhe sensível foi exibido.");
  } finally {
    button.disabled = false;
  }
}

document.querySelectorAll("nav button").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll("nav button").forEach((node) => node.removeAttribute("aria-current"));
    document.querySelectorAll("main > section.grid").forEach((node) => node.classList.add("hidden"));
    button.setAttribute("aria-current", "page");
    byId(`${button.dataset.view}View`).classList.remove("hidden");
  });
});

byId("loadButton").addEventListener("click", loadAll);
