const PLUGIN_DEFINITIONS = Object.freeze({
  infra: Object.freeze({
    title: "ADA Infra",
    risk: "high",
    defaultMode: "read-only/dry-run",
    operations: Object.freeze([
      "operator.status",
      "system.status",
      "docker.ps",
      "fs.list",
      "fs.read",
      "backup.snapshot",
      "ops.healthcheck",
      "github.read",
      "hostinger.read",
      "deploy.dry_run",
    ]),
  }),
  media: Object.freeze({
    title: "ADA Media",
    risk: "medium/high",
    defaultMode: "package/draft/dry-run",
    operations: Object.freeze([
      "elevenlabs.tts.runtime",
      "elevenlabs.tts.voices",
      "elevenlabs.tts.generate_file",
      "reels.package.status",
      "reels.package.materialize",
      "reels.render.from_package",
      "media.asset.upload",
      "vnnox.status",
      "instagram.draft",
    ]),
  }),
  comunicacao: Object.freeze({
    title: "ADA Comunicação",
    risk: "high",
    defaultMode: "draft/dry-run",
    operations: Object.freeze([
      "communication.inbox",
      "communication.thread",
      "whatsapp.diagnostics",
      "whatsapp.templates",
      "whatsapp.draft",
      "whatsapp.handoff",
      "email.search",
      "email.draft",
      "action.approve",
      "action.execute",
    ]),
  }),
  juri: Object.freeze({
    title: "ADA Júri",
    risk: "high/legal",
    defaultMode: "read-only/draft/dry-run",
    operations: Object.freeze([
      "juri.health",
      "unijuri.case.search",
      "unijuri.petition.draft",
      "peterle.clients.resolve",
      "peterle.documents.search",
      "peterle.matters.evidence_pack",
      "peterle.djen.search",
      "peterle.legal.search",
      "milena.product.search",
      "mitra.runtime.status",
    ]),
  }),
});

const WRITE_OR_REAL_OPERATION_PATTERN = /(?:execute|approve|deploy|render|upload|generate_file|materialize|snapshot)$/u;

function nowIso() {
  return new Date().toISOString();
}

function publicRuntimeStatus() {
  const memory = process.memoryUsage();
  return {
    node: process.version,
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    memory: {
      rss: memory.rss,
      heapUsed: memory.heapUsed,
      heapTotal: memory.heapTotal,
    },
  };
}

function normalizedBaseUrl(raw) {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/$/u, "");
    return url.toString().replace(/\/$/u, "");
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url, { method = "GET", headers = {}, body, timeoutMs = 5000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { raw: text.slice(0, 4096) };
    }
    return { ok: response.ok, status: response.status, payload };
  } finally {
    clearTimeout(timer);
  }
}

async function readHealthFromEnv({ envNames, timeoutEnvName, defaultTimeoutMs = 5000 }) {
  const raw = envNames.map((name) => process.env[name]).find((value) => String(value ?? "").trim();
  const baseUrl = normalizedBaseUrl(raw);
  if (!baseUrl) {
    return { configured: false, ok: false, status: "not_configured" };
  }

  try {
    const result = await fetchJsonWithTimeout(`${baseUrl}/health`, {
      timeoutMs: Number(process.env[timeoutEnvName] ?? defaultTimeoutMs),
    });
    return { configured: true, ok: result.ok, statusCode: result.status, payload: result.payload };
  } catch (error) {
    return {
      configured: true,
      ok: false,
      error: error instanceof Error ? error.message : "health_check_failed",
    };
  }
}

function statusPayload({ plugin, operation, dryRun, backendName, backend, note, payload }) {
  return {
    ok: true,
    plugin,
    operation,
    dryRun: Boolean(dryRun),
    status: backend.ok ? `${backendName}_online` : "gateway_online",
    service: "api-gateway",
    checkedAt: nowIso(),
    runtime: publicRuntimeStatus(),
    [backendName]: backend,
    note,
    payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
  };
}

async function builtInInfraAdapter({ operation, dryRun, payload }) {
  if (operation === "operator.status" || operation === "system.status" || operation === "ops.healthcheck") {
    const mcp = await readHealthFromEnv({
      envNames: ["ADA_MCP_BASE_URL", "MCP_BASE_URL"],
      timeoutEnvName: "ADA_MCP_TIMEOUT_MS",
    });
    return {
      status: 200,
      payload: statusPayload({
        plugin: "infra",
        operation,
        dryRun,
        backendName: "mcp",
        backend: mcp,
        payload,
        note: "Safe infra adapter. When ADA_MCP_BASE_URL is configured, this checks MCP /health. VPS, Docker, GitHub, Hostinger and deploy operations remain behind dedicated adapters.",
      }),
    };
  }

  return notImplemented("infra", operation, dryRun, payload, "infra_operation_adapter_not_implemented");
}

async function builtInJuriAdapter({ operation, dryRun, payload }) {
  if (operation === "juri.health" || operation === "mitra.runtime.status") {
    const peterleOps = await readHealthFromEnv({
      envNames: ["ADA_PETERLE_OPS_BASE_URL", "PETERLE_OPS_BASE_URL", "ADA_JURI_BASE_URL"],
      timeoutEnvName: "ADA_JURI_TIMEOUT_MS",
    });
    return {
      status: 200,
      payload: statusPayload({
        plugin: "juri",
        operation,
        dryRun,
        backendName: "peterleOps",
        backend: peterleOps,
        payload,
        note: "Safe juri adapter. When ADA_PETERLE_OPS_BASE_URL is configured, this checks peterle-ops /health. Legal searches and document access remain behind dedicated adapters.",
      }),
    };
  }

  return notImplemented("juri", operation, dryRun, payload, "juri_operation_adapter_not_implemented");
}

async function builtInComunicacaoAdapter({ operation, dryRun, payload }) {
  if (operation === "whatsapp.diagnostics" || operation === "communication.inbox") {
    const comunicacao = await readHealthFromEnv({
      envNames: ["ADA_COMUNICACAO_BASE_URL", "ADA_ZUNI_BASE_URL", "ZUNI_BASE_URL", "ADA_UNICO_BASE_URL"],
      timeoutEnvName: "ADA_COMUNICACAO_TIMEOUT_MS",
    });
    return {
      status: 200,
      payload: statusPayload({
        plugin: "comunicacao",
        operation,
        dryRun,
        backendName: "comunicacao",
        backend: comunicacao,
        payload,
        note: "Safe comunicacao adapter. When ADA_COMUNICACAO_BASE_URL or ADA_ZUNI_BASE_URL is configured, this checks the backend /health. Message send, approve and execute operations remain behind dedicated adapters and confirmation.",
      }),
    };
  }

  return notImplemented("comunicacao", operation, dryRun, payload, "comunicacao_operation_adapter_not_implemented");
}

function notImplemented(plugin, operation, dryRun, payload, error) {
  return {
    status: 501,
    payload: {
      ok: false,
      error,
      plugin,
      operation,
      dryRun: Boolean(dryRun),
      acceptedByContract: true,
      safeFallback: true,
      payloadKeys: payload && typeof payload === "object" ? Object.keys(payload) : [],
    },
  };
}

export function listPluginDefinitions() {
  return Object.entries(PLUGIN_DEFINITIONS).map(([id, definition]) => ({
    id,
    title: definition.title,
    risk: definition.risk,
    defaultMode: definition.defaultMode,
    operations: [...definition.operations],
  });
}

export function getPluginDefinition(pluginId) {
  return PLUGIN_DEFINITIONS[pluginId] ?? null;
}

export function validatePluginCall({ pluginId, operation, dryRun = true, confirmation = "" } = {}) {
  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    return { ok: false, status: 404, error: "plugin_not_found" };
  }

  if (!operation || typeof operation !== "string") {
    return { ok: false, status: 400, error: "operation_required" };
  }

  if (!definition.operations.includes(operation)) {
    return { ok: false, status: 400, error: "operation_not_allowed_for_plugin" };
  }

  const needsConfirmation = WRITE_OR_REAL_OPERATION_PATTERN.test(operation) && dryRun === false;
  if (needsConfirmation && typeof confirmation !== "string") {
    return { ok: false, status: 403, error: "confirmation_required" };
  }
  if (needsConfirmation && !confirmation.trim()) {
    return { ok: false, status: 403, error: "confirmation_required" };
  }

  return {
    ok: true,
    status: 200,
    plugin: {
      id: pluginId,
      title: definition.title,
      risk: definition.risk,
      defaultMode: definition.defaultMode,
    },
    operation,
    dryRun: Boolean(dryRun),
  };
}

export function pluginHealth(pluginId) {
  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    return { status: 404, payload: { ok: false, error: "plugin_not_found" } };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      plugin: pluginId,
      title: definition.title,
      mode: definition.defaultMode,
      status: "draft_gateway_ready",
    },
  };
}

export function pluginCapabilities(pluginId) {
  const definition = getPluginDefinition(pluginId);
  if (!definition) {
    return { status: 404, payload: { ok: false, error: "plugin_not_found" } };
  }

  return {
    status: 200,
    payload: {
      ok: true,
      plugin: pluginId,
      title: definition.title,
      risk: definition.risk,
      defaultMode: definition.defaultMode,
      operations: [...definition.operations],
    },
  };
}

export async function routePluginCall({
  pluginId,
  operation,
  dryRun = true,
  payload = {},
  confirmation = "",
  adapters = {},
} = {}) {
  const validation = validatePluginCall({ pluginId, operation, dryRun, confirmation });
  if (!validation.ok) {
    return {
      status: validation.status,
      payload: {
        ok: false,
        error: validation.error,
        plugin: pluginId,
        operation,
      },
    };
  }

  const adapter = adapters[pluginId]
    ?? (pluginId === "infra" ? builtInInfraAdapter : undefined)
    ?? (pluginId === "juri" ? builtInJuriAdapter : undefined)
    ?? (pluginId === "comunicacao" ? builtInComunicacaoAdapter : undefined);

  if (typeof adapter === "function") {
    const result = await adapter({ operation, dryRun, payload, confirmation });
    return {
      status: result?.status ?? 200,
      payload: result?.payload ?? result ?? { ok: true },
    };
  }

  return notImplemented(pluginId, operation, dryRun, payload, "plugin_adapter_not_implemented");
}
