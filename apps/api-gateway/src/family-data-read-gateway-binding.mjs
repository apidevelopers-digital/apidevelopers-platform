const FAMILY_PREFIX = "/v1/family/";

function jsonResponse(status, payload, headers = {}) {
  return {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...headers
    },
    body: JSON.stringify(payload)
  };
}

function parseRequestUrl(url = "/") {
  return new URL(String(url), "http://api-gateway.local");
}

function normalizeHeaders(headers = {}) {
  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [String(key).toLowerCase(), value])
  );
}

export function createFamilyDataReadGatewayBinding({
  enabled = false,
  handler
} = {}) {
  if (handler !== undefined && typeof handler !== "function") {
    throw new TypeError("handler must be a function");
  }
  if (enabled && typeof handler !== "function") {
    throw new TypeError("handler is required when Family Data gateway binding is enabled");
  }

  const configured = typeof handler === "function";

  function status() {
    return Object.freeze({
      binding: "family-data-read",
      mode: enabled ? "enabled-by-explicit-injection" : "inert",
      enabled,
      configured,
      path_prefix: FAMILY_PREFIX,
      methods: ["GET"],
      runtime_env_read: false,
      network_io_owned_by_binding: false,
      database_io_owned_by_binding: false,
      deploy_executed: false
    });
  }

  function planRequest({
    method = "GET",
    url = "/"
  } = {}) {
    const requestUrl = parseRequestUrl(url);
    const normalizedMethod = String(method).toUpperCase();
    const matched = requestUrl.pathname.startsWith(FAMILY_PREFIX);
    return Object.freeze({
      ...status(),
      matched,
      method: normalizedMethod,
      path: requestUrl.pathname,
      would_forward:
        matched &&
        normalizedMethod === "GET" &&
        enabled &&
        configured
    });
  }

  async function handleRequest({
    method = "GET",
    url = "/",
    headers = {}
  } = {}) {
    const requestUrl = parseRequestUrl(url);
    const pathname = requestUrl.pathname;
    if (!pathname.startsWith(FAMILY_PREFIX)) return null;

    if (!enabled) {
      return jsonResponse(503, {
        ok: false,
        error: "family_data_gateway_binding_disabled"
      });
    }

    const normalizedMethod = String(method).toUpperCase();
    if (normalizedMethod !== "GET") {
      return jsonResponse(405, {
        ok: false,
        error: "method_not_allowed"
      });
    }

    const result = await handler({
      method: "GET",
      path: pathname,
      query: Object.fromEntries(requestUrl.searchParams.entries()),
      headers: normalizeHeaders(headers)
    });

    if (
      !result ||
      !Number.isInteger(result.status) ||
      result.status < 100 ||
      result.status > 599 ||
      !result.body ||
      typeof result.body !== "object" ||
      Array.isArray(result.body)
    ) {
      throw new Error("family_data_handler_response_invalid");
    }

    return jsonResponse(
      result.status,
      result.body,
      result.headers ?? {}
    );
  }

  return Object.freeze({
    status,
    planRequest,
    handleRequest
  });
}
