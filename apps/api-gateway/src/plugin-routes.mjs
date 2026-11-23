import {
  pluginCapabilities,
  pluginHealth,
  routePluginCall,
} from "./plugin-gateway.mjs";

function jsonResponse(status, payload) {
  return {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(payload),
  };
}

function parseJsonObjectBody(body) {
  if (body === undefined || String(body).trim() === "") return {};

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

    const result = pluginCapabilities(pluginId);
    return jsonResponse(result.status, result.payload);
  }

  if (action === "call") {
    if (normalizedMethod !== "POST") {
      return jsonResponse(405, { ok: false, error: "method_not_allowed", plugin: pluginId, action });
    }

    const parsed = parseJsonObjectBody(body);
    if (!parsed.ok) return jsonResponse(400, { ok: false, error: parsed.error, plugin: pluginId, action });

    const request = parsed.value;
    const result = await routePluginCall({
      pluginId,
      operation: request.operation,
      dryRun: request.dry_run ?? request.dryRun ?? true,
      payload: request.payload ?? {},
      confirmation: request.confirmation ?? "",
    });

    return jsonResponse(result.status, result.payload);
  }

  return jsonResponse(404, { ok: false, error: "plugin_action_not_found", plugin: pluginId, action });
}
