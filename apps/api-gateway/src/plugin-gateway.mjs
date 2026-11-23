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

export function listPluginDefinitions() {
  return Object.entries(PLUGIN_DEFINITIONS).map(([id, definition]) => ({
    id,
    title: definition.title,
    risk: definition.risk,
    defaultMode: definition.defaultMode,
    operations: [...definition.operations],
  }));
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

  const adapter = adapters[pluginId];
  if (typeof adapter === "function") {
    const result = await adapter({ operation, dryRun, payload, confirmation });
    return {
      status: result?.status ?? 200,
      payload: result?.payload ?? result ?? { ok: true },
    };
  }

  return {
    status: 501,
    payload: {
      ok: false,
      error: "plugin_adapter_not_implemented",
      plugin: pluginId,
      operation,
      dryRun: Boolean(dryRun),
      acceptedByContract: true,
    },
  };
}
