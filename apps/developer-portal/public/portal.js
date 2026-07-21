
import { ReadApiClient } from "./api-client.js";

const byId = (id) => document.getElementById(id);
const safeArray = (value) => Array.isArray(value) ? value : [];
const text = (value) => value == null || value === "" ? "—" : String(value);

function item(title, body, badge = "") {
  const node = document.createElement("div");
  node.className = "item";
  const heading = document.createElement("strong");
  heading.textContent = badge ? `${badge} · ${text(title)}` : text(title);
  const detail = document.createElement("div");
  detail.className = "muted";
  detail.textContent = text(body);
  node.append(heading, detail);
  return node;
}

function renderList(target, entries, emptyTitle, mapper) {
  target.replaceChildren();
  if (!entries.length) {
    target.append(item(emptyTitle, "Estado vazio legítimo."));
    return;
  }
  entries.forEach((entry) => target.append(mapper(entry)));
}

function setState(kind, title, message) {
  const state = byId("globalState");
  state.className = `card wide state ${kind || ""}`.trim();
  state.replaceChildren();
  const h = document.createElement("h2");
  h.textContent = title;
  const p = document.createElement("p");
  p.textContent = message;
  state.append(h, p);
}

function normalizeInstitutional(payload) {
  return payload?.data || payload?.snapshot || payload || {};
}

function normalizeLearning(payload) {
  return payload?.data || payload?.learning || payload || {};
}

function renderInstitutional(payload) {
  const data = normalizeInstitutional(payload);
  const records = safeArray(data.records);
  const modules = safeArray(data.modules);
  const versions = safeArray(data.versions);
  const summary = data.summary || {};
  const integrity = data.integrity || {};
  const meta = payload?.meta || data.meta || {};

  byId("summaryTitle").textContent = text(summary.title || "Resumo institucional");
  byId("summaryText").textContent = text(summary.description || summary.status || "Projeção institucional carregada.");
  byId("recordsCount").textContent = records.length;
  byId("modulesCount").textContent = modules.length;
  byId("versionsCount").textContent = versions.length;

  renderList(byId("recordsList"), records, "Nenhum registro projetado", (entry) =>
    item(entry.title || entry.label || entry.id, entry.summary || entry.status || "Registro derivado")
  );
  renderList(byId("modulesList"), modules, "Nenhum módulo projetado", (entry) =>
    item(entry.title || entry.label || entry.id, entry.summary || entry.status || "Módulo derivado")
  );

  const integrityEntries = [
    { title: "Integridade", body: integrity.status || "unknown" },
    ...safeArray(integrity.sources).map((source) => ({
      title: source.label || source.id,
      body: source.version || "fonte canônica",
    })),
  ];
  renderList(byId("integrityPanel"), integrityEntries, "Origem não informada", (entry) =>
    item(entry.title, entry.body)
  );

  byId("projectionBadge").textContent = meta.stale
    ? "Potencialmente desatualizado"
    : `Projeção ${text(meta.projectionVersion || "carregada")}`;

  const trace = [
    ["Versão da projeção", meta.projectionVersion],
    ["Contrato", meta.contractVersion],
    ["Projetor", meta.projector],
    ["Gerado em", meta.generatedAt],
    ["Correlação", meta.correlationId],
  ];
  renderList(byId("traceabilityPanel"), trace, "Metadados não informados", ([title, body]) =>
    item(title, body)
  );
}

function renderLearning(payload) {
  const data = normalizeLearning(payload);
  const memories = safeArray(data.memories);
  const findings = safeArray(data.findings);
  const proposals = safeArray(data.proposals);
  const evidence = safeArray(data.evidence);
  const recent = [...memories.slice(0, 2), ...findings.slice(0, 3)];

  renderList(byId("learningPreview"), recent, "Sem aprendizado recente", (entry) =>
    item(entry.title || entry.label || entry.id, entry.summary || entry.description || "Leitura derivada")
  );
  renderList(byId("findingsList"), [...memories, ...findings], "Sem memórias ou achados", (entry) =>
    item(entry.title || entry.label || entry.id, entry.summary || entry.description || "Leitura derivada")
  );
  renderList(byId("proposalsList"), proposals, "Sem propostas", (entry) =>
    item(
      entry.title || entry.id,
      entry.summary || "Proposta derivada",
      entry.status === "approved" ? "Aprovada externamente" : "Não aprovada"
    )
  );
  renderList(byId("evidenceList"), evidence, "Sem evidências", (entry) =>
    item(entry.title || entry.id, entry.summary || entry.uri || "Evidência rastreável")
  );
}

async function loadAll() {
  const button = byId("loadButton");
  button.disabled = true;
  setState("", "Carregando projeções", "Consultando APIs de leitura pelo gateway.");

  try {
    const client = new ReadApiClient({
      baseUrl: byId("baseUrl").value,
      apiKey: byId("apiKey").value,
    });
    const [institutional, learning] = await Promise.all([
      client.institutionalSnapshot(),
      client.learningSnapshot(),
    ]);
    renderInstitutional(institutional);
    renderLearning(learning);
    setState("", "Leitura disponível", "Projeções carregadas sem mutação. Aprovação humana continua obrigatória.");
  } catch (error) {
    const policy = [401, 403].includes(error.status);
    setState(
      policy ? "warn" : "error",
      policy ? "Sem permissão ou bloqueado por política" : "Erro de carregamento",
      policy
        ? "O Portal não revelará objetos fora do escopo autorizado."
        : `Falha ${error.message}. Tente novamente quando o gateway estiver disponível.`
    );
    byId("projectionBadge").textContent = policy ? "Acesso restrito" : "Projeção indisponível";
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
