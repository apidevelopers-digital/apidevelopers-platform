const panel = document.getElementById("traceabilityPanel");

function text(value, fallback = "—") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function metricNode(metric) {
  const node = document.createElement("div");
  node.className = "item";

  const heading = document.createElement("strong");
  heading.textContent = metric.name === "institutional" ? "Institucional" : "Aprendizado";

  const detail = document.createElement("div");
  detail.className = "muted";
  const status = metric.ok ? "disponível" : `falha ${text(metric.status)}`;
  const correlation = metric.correlationId ? ` · correlação ${metric.correlationId}` : "";
  detail.textContent = `${status} · ${text(metric.durationMs)} ms${correlation}`;

  node.append(heading, detail);
  return node;
}

function renderObservability({ summary, metrics } = {}) {
  if (!panel || !summary || !Array.isArray(metrics)) return;

  const previous = document.getElementById("localObservability");
  previous?.remove();

  const section = document.createElement("section");
  section.id = "localObservability";
  section.className = "item";
  section.setAttribute("aria-label", "Observabilidade local");

  const heading = document.createElement("strong");
  heading.textContent = "Observabilidade local";

  const overview = document.createElement("div");
  overview.className = "muted";
  overview.textContent = `${summary.successes}/${summary.count} projeções disponíveis · ${text(summary.durationMs)} ms acumulados`;

  const list = document.createElement("div");
  list.className = "list";
  metrics.forEach((metric) => list.append(metricNode(metric)));

  section.append(heading, overview, list);
  panel.append(section);
}

globalThis.addEventListener?.("portal:observability", (event) => {
  renderObservability(event.detail);
});

export { renderObservability };
