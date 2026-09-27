import { createMitraMcpV1Runtime } from "./mitra-mcp-v1-runtime.mjs";

const HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

export const MITRA_MCP_V1_HTTP_ROUTES = Object.freeze({
  status: "/v1/mitra/mcp/status",
  capabilities: "/v1/mitra/mcp/capabilities",
  toolsPrefix: "/v1/mitra/mcp/tools/",
});

const json = (status, payload) => Object.freeze({
  status,
  headers: HEADERS,
  body: JSON.stringify(payload),
});

function pathOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
}

function getHeader(headers = {}, name) {
  const expected = String(name).toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (String(key).toLowerCase() === expected) return value;
  }
  return undefined;
}

function tenantFrom({ headers = {}, context = {}, identity = {} } = {}) {
  return (
    String(getHeader(headers, "x-tenant-id") ?? "").trim() ||
    String(context.tenantId ?? "").trim() ||
    String(identity.tenantId ?? "").trim() ||
    String(identity.principal?.tenantId ?? "").trim()
  );
}

function parseBody(body) {
  if (body === undefined || body === null || String(body).trim() === "") return { ok: true, value: {} };
  try {
    const value = JSON.parse(String(body));
    if (value === null || Array.isArray(value) || typeof value !== "object") {
      return { ok: false, error: "invalid_input", reason: "Request body must be a JSON object." };
    }
    return { ok: true, value };
  } catch {
    return { ok: false, error: "invalid_json", reason: "Request body must be valid JSON." };
  }
}

function statusFor(result) {
  if (result?.ok === true) return 200;
  if (result?.error === "unauthorized") return 401;
  if (result?.error === "forbidden" || result?.error === "insufficient_scope") return 403;
  if (["tenant_not_found", "invalid_input", "invalid_json"].includes(result?.error)) return 400;
  if (result?.error === "unknown_tool") return 404;
  if (result?.error === "dependency_unavailable") return 503;
  return 500;
}

function toolFromPath(pathname) {
  if (pathname === MITRA_MCP_V1_HTTP_ROUTES.status) return "mitra.status";
  if (pathname === MITRA_MCP_V1_HTTP_ROUTES.capabilities) return "mitra.capabilities";
  if (!pathname.startsWith(MITRA_MCP_V1_HTTP_ROUTES.toolsPrefix)) return null;
  const value = pathname.slice(MITRA_MCP_V1_HTTP_ROUTES.toolsPrefix.length);
  if (!value) return null;
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

async function authenticate({ authenticator, headers }) {
  if (!authenticator) return { ok: false, response: json(503, { ok: false, error: "authentication_unavailable" }) };
  const identity = await authenticator.authenticate(headers);
  if (!identity) return { ok: false, response: json(401, { ok: false, error: "unauthorized" }) };
  return { ok: true, identity };
}

export function createMitraMcpV1HttpApp({ app, authenticator, runtime = createMitraMcpV1Runtime() } = {}) {
  if (app !== undefined && typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function when provided");
  }
  if (authenticator !== undefined && typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function when provided");
  }
  if (typeof runtime?.executeTool !== "function") {
    throw new TypeError("runtime.executeTool must be a function");
  }

  async function runTool({ name, input = {}, context = {}, headers = {}, identity }) {
    const tenantId = tenantFrom({ headers, context, identity });
    const result = await runtime.executeTool({
      name,
      input,
      context: Object.freeze({
        ...(context.tenantId ? { tenantId: String(context.tenantId) } : {}),
        ...(Array.isArray(context.scopes) ? { scopes: context.scopes.map(String) } : {}),
        ...(tenantId ? { tenantId } : {}),
      }),
      identity,
    });
    return json(statusFor(result), result);
  }

  return Object.freeze({
    routes: MITRA_MCP_V1_HTTP_ROUTES,
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const headers = request.headers ?? {};
      const pathname = pathOf(request.url);
      const name = toolFromPath(pathname);

      if (!name) return app ? app.handleRequest(request) : null;

      const auth = await authenticate({ authenticator, headers });
      if (!auth.ok) return auth.response;

      if (pathname === MITRA_MCP_V1_HTTP_ROUTES.status || pathname === MITRA_MCP_V1_HTTP_ROUTES.capabilities) {
        if (method !== "GET") return json(405, { ok: false, error: "method_not_allowed" });
        return runTool({ name, headers, identity: auth.identity });
      }

      if (method !== "POST") return json(405, { ok: false, error: "method_not_allowed" });

      const body = parseBody(request.body);
      if (!body.ok) {
        return json(400, {
          ok: false,
          error: body.error,
          reason: body.reason,
          retryable: false,
          needsHumanReview: false,
        });
      }

      return runTool({
        name,
        input: body.value.input ?? {},
        context: body.value.context ?? {},
        headers,
        identity: auth.identity,
      });
    },
  });
}

export const mitraMcpV1HttpContract = Object.freeze({
  service: "mitra-mcp",
  transport: "http-json",
  routes: MITRA_MCP_V1_HTTP_ROUTES,
  secretsReturned: false,
  productionChangedByDefault: false,
  firstRunnableTools: Object.freeze(["mitra.status", "mitra.capabilities"]),
});
