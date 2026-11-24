import {
  pluginCapabilities,
  pluginHealth,
  routePluginCall,
} from "./plugin-gateway.mjs";

const JURI_DATAJUD_OPERATIONS = Object.freeze([
  "juri.datajud.status",
  "juri.datajud.smoke",
  "juri.datajud.request",
  "juri.datajud.job.get",
]);

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function parseJsonObjectBody(body) {
  if (body === undefined || body === null || String(body).trim() === "") return { ok: true, value: {} };

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: "invalid_json_body" };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "json_object_body_required" };
  }

  return { ok: true, value: parsed };
}

function withJuriDatajudCapabilities(result) {
  if (!result || result.status !== 200 || !result.payload || result.payload.id !== "juri") {
    return result;
  }

  const existing = Array.isArray(result.payload.operations) ? result.payload.operations : [];
  const operations = [...new Set([...existing, ...JURI_DATAJUD_OPERATIONS])];

  return {
    ...result,
    payload: {
      ...result.payload,
      operations,
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

function unicoBaseUrl() {
  return normalizedBaseUrl(process.env.ADA_UNICO_BASE_URL)
    ?? normalizedBaseUrl(process.env.UNICO_BASE_URL)
    ?? "https://unico.sitedauni.com";
}

function unicoApiKey() {
  return String(
    process.env.ADA_UNICO_API_KEY
      ?? process.env.UNICO_API_KEY
      ?? process.env.ADA_JURI_UNICO_API_KEY
      ?? "",
  ).trim();
}

function publicRuntimeMeta() {
  return {
    runtime: "unico.sitedauni.com",
    bridge: "juri-datajud-http-intercept-bridge-v3",
    secretExposed: false,
    rawResultIncluded: false,
  };
}

async function fetchUnicoJson({ method = "GET", path, body, timeoutMs = 35000 }) {
  const key = unicoApiKey();
  if (!key) {
    return {
      status: 503,
      payload: {
        ok: false,
        error: "unico_api_key_not_configured",
        ...publicRuntimeMeta(),
      },
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${unicoBaseUrl()}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        "x-unico-api-key": key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });

    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = { ok: false, error: "unico_non_json_response", responseBytes: text.length };
    }

    return {
      status: response.status,
      payload: {
        ok: response.ok,
        upstreamStatus: response.status,
        ...publicRuntimeMeta(),
        result: payload,
      },
    };
  } catch (error) {
    return {
      status: error?.name === "AbortError" ? 504 : 502,
      payload: {
        ok: false,
        error: error?.name === "AbortError" ? "unico_timeout_or_abort" : "unico_request_failed",
        errorName: error?.name ?? "Error",
        message: error instanceof Error ? error.message : String(error),
        ...publicRuntimeMeta(),
      },
    };
  } finally {
    clearTimeout(timer);
  }
}

function datajudRequestPayload(payload = {}) {
  return {
    tribunalAlias: payload.tribunalAlias ?? payload.tribunal ?? payload.alias,
    cnjNumber: payload.cnjNumber ?? payload.cnj ?? payload.numeroProcesso,
    timeoutMs: payload.timeoutMs ?? 30000,
  };
}

async function routeJuriDatajudCall({ operation, payload = {} }) {
  if (operation === "juri.datajud.status") {
    return fetchUnicoJson({
      method: "GET",
      path: "/juri/datajud/status",
      timeoutMs: Number(payload.timeoutMs ?? 10000),
    });
  }

  if (operation === "juri.datajud.smoke") {
    return fetchUnicoJson({
      method: "POST",
      path: "/juri/datajud/smoke",
      body: datajudRequestPayload(payload),
      timeoutMs: Number(payload.timeoutMs ?? 40000),
    });
  }

  if (operation === "juri.datajud.request") {
    return fetchUnicoJson({
      method: "POST",
      path: "/juri/datajud/request",
      body: datajudRequestPayload(payload),
      timeoutMs: Number(payload.timeoutMs ?? 15000),
    });
  }

  if (operation === "juri.datajud.job.get") {
    const jobId = String(payload.jobId ?? payload.id ?? "").trim();
    if (!jobId) {
      return {
        status: 400,
        payload: {
          ok: false,
          error: "job_id_required",
          ...publicRuntimeMeta(),
        },
      };
    }

    return fetchUnicoJson({
      method: "GET",
      path: `/juri/datajud/jobs/${encodeURIComponent(jobId)}`,
      timeoutMs: Number(payload.timeoutMs ?? 15000),
    });
  }

  return null;
}

export async function tryHandlePluginRoute({ method = "GET", url = "/", body } = {}) {
  const normalizedMethod = String(method).toUpperCase();
  const requestUrl = new URL(String(url), "http://api-gateway.local");
  const match = requestUrl.pathname.match(/^\/v1\/plugins\/([^/]+)\/(health|capabilities|call)$/u);

  if (!match) return null;

  const [, pluginId, action] = match;

  if (action === "health") {
    if (normalizedMethod !== "GET") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed", plugin: pluginId, action });
    }

    const result = pluginHealth(pluginId);
    return jsonResponse(result.status, result.payload);
  }

  if (action === "capabilities") {
    if (normalizedMethod !== "GET") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed", plugin: pluginId, action });
    }

    const result = withJuriDatajudCapabilities(pluginCapabilities(pluginId));
    return jsonResponse(result.status, result.payload);
  }

  if (action === "call") {
    if (normalizedMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed", plugin: pluginId, action });
    }

    const parsed = parseJsonObjectBody(body);
    if (!parsed.ok) return jsonResponse(400, { ok: false, error: parsed.error, plugin: pluginId, action });

    const request = parsed.value;
    const operation = request.operation;
    const dryRun = request.dry_run ?? request.dryRun ?? true;
    const payload = request.payload ?? {};

    if (pluginId === "juri" && JURI_DATAJUD_OPERATIONS.includes(operation)) {
      const datajudResult = await routeJuriDatajudCall({ operation, payload });
      return jsonResponse(datajudResult.status, {
        ...datajudResult.payload,
        plugin: pluginId,
        operation,
        dryRun: Boolean(dryRun),
        acceptedByContract: true,
      });
    }

    const result = await routePluginCall({
      pluginId,
      operation,
      dryRun,
      payload,
      confirmation: request.confirmation ?? "",
    });

    return jsonResponse(result.status, result.payload);
  }

  return jsonResponse(404, { ok: false, error: "plugin_action_not_found", plugin: pluginId, action });
}
