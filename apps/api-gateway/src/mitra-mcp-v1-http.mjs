import { createMitraMcpV1Runtime } from "./mitra-mcp-v1-runtime.mjs";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

const ROUTES = Object.freeze({
  status: "/v1/mitra/mcp/status",
  capabilities: "/v1/mitra/mcp/capabilities",
  toolsPrefix: "/v1/mitra/mcp/tools/",
});

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  });
}

function parseUrl(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local");
}

function headerValue(headers = {}, name) {
  const lowerName = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (String(key).toLowerCase() === lowerName) return value;
  }
  return undefined;
}

function readTenantId({ headers = {}, bodyContext = {}, identity = {} } = {}) {
  return (
    String(headerValue(headers, "x-tenant-id") ?? "").trim() ||
    String(bodyContext?.tenantId ?? "").trim() ||
    String(identity?.tenantId ?? "").trim() ||
    String(identity?.principal?.tenantId ?? "").trim()
  );
}

function sanitizeContext(context = {}) {
  const tenantId = String(context?.tenantId ?? "").trim();
  const scopes = Array.isArray(context?.scopes) ? context.scopes.map(String) : undefined;
  return Object.freeze({
    ...(tenantId ? { tenantId } : {}),
    ...(scopes ? { scopes } : {}),
  });
}

function parseJsonBody(body) {
  if (body === undefined || body === null || String(body).trim() === "") return { ok: true, value: {} };
  try {
    const parsed = JSON.parse(String(body));
    if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
      return { ok: false, error: "invalid_input", reason: "Request body must be a JSON object." };
    }
    return { ok: true, value: parsed };
  } catch {
    return { ok: false, error: "invalid_json", reason: "Request body must be valid JSON." };
  }
}

function statusForToolResult(result) {
  if (result?.ok === true) return 200;
  if (result?.error === "unauthorized") return 401;
  if (result?.error === "forbidden" || result?.error === "insufficient_scope") return 403;
  if (result?.error === "tenant_not_found" || result?.error === "invalid_input" || result?.error === "invalid_json") return 400;
  if (result?.error === "unknown_tool") return 404;
  if (result?.error === "dependency_unavailable") return 503;
  return 500;
}

function safeToolNameFromPath(pathname) {
  if (!pathname.startsWith(ROUTES.toolsPrefix)) return null;
  const encoded = pathname.slice(ROUTES.toolsPrefix.length);
  if (!encoded) return null;
  try {
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

async function authenticateOrError(authenticator, headers) {
  if (!authenticator) {
    return { ok: false, response: jsonResponse(503, { ok: false, error: "authentication_unavailable" }) };
  }
  const identity = await authenticator.authenticate(headers);
  if (!identity) {
    return { ok: false, response: jsonResponse(401, { ok: false, error: "unauthorized" }) };
  }
  return { ok: true, identity };
}

export function createMitraMcpV1HttpApp({
  app,
  authenticator,r  runtime = createMitraMcpV1Runtime(),
} = {}) {
  if (app !== undefined && typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function when provided");
  }
  if (authenticator !== undefined && typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function when provided");
  }
  if (typeof runtime?.executeTool !== "function") {
    throw new TypeError("runtime.executeTool must be a function");
  }

  async function executeHttpTool({ toolName, input = {}, context = {}, headers = {}, identity }) {
    const tenantId = readTenantId({ headers, bodyContext: context, identity });
    const result = await runtime.executeTool({
      name: toolName,
      input,
      context: {
        ...sanitizeContext(context),
        ...(tenantId ? { tenantId } : {}),
      },
      identity,
    });
    return jsonResponse(statusForToolResult(result), result);
  }

  return Object.freeze({
    routes: ROUTES,

    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = parseUrl(request.url);
      const pathname = url.pathname;
      const headers = request.headers ?? {};

      const directTool =
        pathname === ROUTES.status ? "mitra.status" :
        pathname === ROUTES.capabilities ? "mitra.capabilities" :
        safeToolNameFromPath(pathname);

      if (!directTool) {
        return app ? app.handleRequest(request) : null;
      }

      const auth = await authenticateOrError(authenticator, headers);
      if (!auth.ok) return auth.response;

      if (pathname === ROUTES.status || pathname === ROUTES.capabilities) {
        if (method !== "GET") {
          return jsonResponse(405, { ok: false, error: "method_not_allowed" });
        }
        return executeHttpTool({
          toolName: directTool,
          input: {},
          context: {},
          headers,
          identity: auth.identity,
        });
      }

      if (method !== "POST") {
        return jsonResponse(405, { ok: false, error: "method_not_allowed" });
      }

      const parsed = parseJsonBody(request.body);
      if (!parsed.ok) {
        return jsonResponse(400, {
          ok: false,
          error: parsed.error,
          reason: parsed.reason,
          retryable: false,
          needsHumanReview: false,
        });
      }

      return executeHttpTool({
        toolName: directTool,
        input: parsed.value.input ?? {},
        context: parsed.value.context ?? {},
        headers,
        identity: auth.identity,
      });
    },
  });
}

export const mitraMcpV1HttpContract = Object.freeze({
  service: "mitra-mcp",
  routes: ROUTES,
  transport: "http-json",
  secretsReturned: false,
  productionChangedByDefault: false,
  firstRunnableTools: Object.freeze(["mitra.status", "mitra.capabilities"]),
});
