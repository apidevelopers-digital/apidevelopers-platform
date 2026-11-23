const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

const MACROPLUGINS = Object.freeze({
  infra: {
    id: "ada-infra",
    risk: "high",
    defaultMode: "read-only/dry-run",
    operations: [
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
    ],
  },
  juri: {
    id: "ada-juri",
    risk: "high/legal",
    defaultMode: "read-only/draft/dry-run",
    operations: [
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
    ],
  },
  comunicacao: {
    id: "ada-comunicacao",
    risk: "high",
    defaultMode: "draft/dry-run",
    operations: [
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
    ],
  },
  media: {
    id: "ada-media",
    risk: "medium/high",
    defaultMode: "package/draft/dry-run",
    operations: [
      "elevenlabs.tts.runtime",
      "elevenlabs.tts.voices",
      "elevenlabs.tts.generate_file",
      "reels.package.status",
      "reels.package.materialize",
      "reels.render.from_package",
      "media.asset.upload",
      "vnnox.status",
      "instagram.draft",
    ],
  },
});

function jsonResult({ status = 200, payload }) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function parseJsonBody(body) {
  if (!body) return {};
  if (typeof body === "object") return body;
  try {
    return JSON.parse(String(body));
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
}

function requiresConfirmation({ plugin, operation, dryRun }) {
  if (dryRun !== false) return false;
  const text = `${plugin}:${operation}`.toLowerCase();
  return [
    "send",
    "execute",
    "deploy",
    "rollback",
    "restart",
    "merge",
    "publish",
    "dns",
    "delete",
    "remove",
    "render",
    "vnnox",
    "approve",
  ].some((token) => text.includes(token));
}

function assertPlugin(pluginName) {
  const plugin = MACROPLUGINS[pluginName];
  if (!plugin) {
    const error = new Error(`Unknown plugin: ${pluginName}`);
    error.statusCode = 404;
    throw error;
  }
  return plugin;
}

function routeInfo(pluginName, action) {
  const plugin = assertPlugin(pluginName);

  if (action === "health") {
    return {
      ok: true,
      plugin: plugin.id,
      status: "draft-ready",
      release: "chatgpt-plugin-gateway-draft-v1",
    };
  }

  if (action === "capabilities") {
    return {
      ok: true,
      plugin: plugin.id,
      risk: plugin.risk,
      default_mode: plugin.defaultMode,
      operations: plugin.operations,
    };
  }

  return null;
}

async function defaultDispatch({ pluginName, plugin, operation, payload, dryRun, confirmation }) {
  const allowed = plugin.operations.includes(operation);
  if (!allowed) {
    return {
      ok: false,
      error: "operation_not_registered",
      plugin: plugin.id,
      operation,
      registered_operations: plugin.operations,
    };
  }

  if (requiresConfirmation({ plugin: pluginName, operation, dryRun }) && !confirmation) {
    return {
      ok: false,
      error: "confirmation_required",
      plugin: plugin.id,
      operation,
      policy: "Real actions require explicit confirmation.",
    };
  }

  return {
    ok: true,
    plugin: plugin.id,
    operation,
    dry_run: dryRun !== false,
    payload: payload ?? {},
    status: "accepted_by_gateway_draft",
    note: "Backend routing is intentionally not enabled until deployment configuration is reviewed.",
  };
}

export function createChatgptPluginGatewayBridge({ dispatch = defaultDispatch } = {}) {
  return Object.freeze({
    async handleRequest({ method = "GET", pathname = "/", body } = {}) {
      const match = String(pathname).match(/^\/v1\/plugins\/([^/]+)\/([^/?#]+)$/);
      if (!match) return null;

      const [, pluginName, action] = match;
      const plugin = assertPlugin(pluginName);

      if (method === "GET") {
        const info = routeInfo(pluginName, action);
        if (info) return jsonResult({ payload: info });
      }

      if (method === "POST" && action === "call") {
        const parsed = parseJsonBody(body);
        const operation = parsed.operation;
        if (!operation || typeof operation !== "string") {
          return jsonResult({
            status: 400,
            payload: {
              ok: false,
              error: "operation_required",
            },
          });
        }

        const result = await dispatch({
          pluginName,
          plugin,
          operation,
          payload: parsed.payload ?? {},
          dryRun: parsed.dry_run,
          confirmation: parsed.confirmation ?? parsed.confirmacao ?? "",
        });

        const status = result?.error === "confirmation_required" ? 403 : 200;
        return jsonResult({ status, payload: result });
      }

      return jsonResult({
        status: 405,
        payload: {
          ok: false,
          error: "method_not_allowed",
          plugin: plugin.id,
          action,
        },
      });
    },
  });
}

export { MACROPLUGINS };
