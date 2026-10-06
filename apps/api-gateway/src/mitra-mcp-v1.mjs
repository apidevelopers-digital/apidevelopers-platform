const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
});

const SERVER = Object.freeze({
  name: "mitra-mcp-v1",
  version: "0.1.0",
  protocolVersion: "2025-06-18",
});

const TOOLS = Object.freeze([
  Object.freeze({ name: "mitra.status", scope: "mitra:status:read", backend: "ada-gateway", description: "Confirma disponibilidade do Mitra MCP v1." }),
  Object.freeze({ name: "mitra.capabilities", scope: "mitra:capabilities:read", backend: "ada-gateway", description: "Lista ferramentas e limites do tenant." }),
  Object.freeze({ name: "mitra.buscar_jurisprudencia", scope: "mitra:jurisprudencia:read", backend: "lex-legal-api", description: "Busca jurisprudência via Lex Legal API." }),
  Object.freeze({ name: "mitra.pesquisar_fontes_oficiais", scope: "mitra:fontes:read", backend: "lex-legal-api", description: "Pesquisa fontes oficiais via Lex Legal API." }),
  Object.freeze({ name: "mitra.buscar_processo", scope: "mitra:processos:read", backend: "lex-legal-api", description: "Busca metadados públicos de processo quando configurado." }),
]);

const TOOL_BY_NAME = Object.freeze(Object.fromEntries(TOOLS.map((tool) => [tool.name, tool])));

function jsonResponse(status, payload) {
  return Object.freeze({ status, headers: JSON_HEADERS, body: JSON.stringify(payload) });
}

function rpcResult(id, result) {
  return Object.freeze({ jsonrpc: "2.0", id: id ?? null, result });
}

function rpcError(id, code, message, data = undefined) {
  return Object.freeze({
    jsonrpc: "2.0",
    id: id ?? null,
    error: Object.freeze({ code, message, ...(data === undefined ? {} : { data }) }),
  });
}

function safe(value) {
  return String(value ?? "unmapped").slice(0, 160).replace(/[^a-zA-Z0-9_.: -]/g, "_");
}

function scopesOf(identity) {
  const principal = identity?.principal ?? identity ?? {};
  return Array.isArray(principal.scopes) ? principal.scopes : [];
}

function tenantOf(identity) {
  const principal = identity?.principal ?? identity ?? {};
  return String(principal.tenantId ?? identity?.tenantId ?? "unknown");
}

function hasScope(identity, scope) {
  const scopes = scopesOf(identity);
  return scopes.includes(scope) || scopes.includes("mitra:admin");
}

function limitOf(value) {
  const n = Number(value ?? 10);
  return Number.isSafeInteger(n) && n > 0 ? Math.min(n, 25) : 10;
}

function toolSchema(tool) {
  const base = { type: "object", additionalProperties: false, properties: {} };
  if (tool.name === "mitra.buscar_jurisprudencia") {
    return { ...base, required: ["query"], properties: { query: { type: "string" }, jurisdiction: { type: "string" }, court: { type: "string" }, dateFrom: { type: "string" }, dateTo: { type: "string" }, limit: { type: "integer" } } };
  }
  if (tool.name === "mitra.pesquisar_fontes_oficiais") {
    return { ...base, required: ["query"], properties: { query: { type: "string" }, source: { type: "string" }, limit: { type: "integer" } } };
  }
  if (tool.name === "mitra.buscar_processo") {
    return { ...base, required: ["numeroCnj"], properties: { numeroCnj: { type: "string" } } };
  }
  return base;
}

function listTools() {
  return TOOLS.map((tool) => Object.freeze({
    name: tool.name,
    description: tool.description,
    inputSchema: Object.freeze(toolSchema(tool)),
  }));
}

function toolPayload(payload) {
  return Object.freeze({
    content: Object.freeze([Object.freeze({ type: "text", text: JSON.stringify(payload) })]),
    structuredContent: payload,
  });
}

function unavailable(tool, dependency) {
  return Object.freeze({
    ok: false,
    error: "dependency_unavailable",
    reason: `${dependency}_not_configured`,
    tool,
    retryable: false,
    needsHumanReview: true,
  });
}

function validateArgs(name, args) {
  if (!args || typeof args !== "object" || Array.isArray(args)) return "invalid_input";
  if (name === "mitra.buscar_jurisprudencia" && String(args.query ?? "").trim().length < 3) return "invalid_query";
  if (name === "mitra.pesquisar_fontes_oficiais" && String(args.query ?? "").trim().length < 3) return "invalid_query";
  if (name === "mitra.buscar_processo" && String(args.numeroCnj ?? "").trim().length < 10) return "invalid_numero_cnj";
  return null;
}

async function readJson(request) {
  if (typeof request?.body === "string" && request.body.trim()) return JSON.parse(request.body);
  if (request?.body && typeof request.body === "object") return request.body;
  return {};
}

async function callLex({ name, args, identity, lexClient }) {
  const context = Object.freeze({ tenantId: tenantOf(identity), toolName: name });
  if (name === "mitra.buscar_jurisprudencia") {
    if (typeof lexClient?.buscarJurisprudencia !== "function") return unavailable(name, "lex_legal_api");
    return await lexClient.buscarJurisprudencia({ ...args, query: String(args.query), limit: limitOf(args.limit) }, context);
  }
  if (name === "mitra.pesquisar_fontes_oficiais") {
    if (typeof lexClient?.pesquisarFontesOficiais !== "function") return unavailable(name, "lex_legal_api");
    return await lexClient.pesquisarFontesOficiais({ ...args, query: String(args.query), source: String(args.source ?? "all"), limit: limitOf(args.limit) }, context);
  }
  if (name === "mitra.buscar_processo") {
    if (typeof lexClient?.buscarProcesso !== "function") return unavailable(name, "lex_legal_api");
    return await lexClient.buscarProcesso({ numeroCnj: String(args.numeroCnj) }, context);
  }
  return unavailable(name, "unknown_backend");
}

export function createMitraMcpV1Server({ authenticate, lexClient, now = () => new Date().toISOString() } = {}) {
  return Object.freeze({
    server: SERVER,
    tools: TOOLS,

    async handleRequest(request = {}) {
      const pathname = new URL(String(request.url ?? "/mcp"), "https://mitra.local").pathname;
      const method = String(request.method ?? "POST").toUpperCase();
      if (!["/mcp", "/v1/mitra/mcp"].includes(pathname)) return null;
      if (method !== "POST") return jsonResponse(405, rpcError(null, -32000, "method_not_allowed"));

      let rpc;
      try {
        rpc = await readJson(request);
      } catch (error) {
        return jsonResponse(400, rpcError(null, -32700, "parse_error", safe(error?.message)));
      }

      const id = rpc?.id ?? null;
      if (rpc?.jsonrpc !== "2.0") return jsonResponse(400, rpcError(id, -32600, "invalid_request"));

      if (rpc.method === "initialize") {
        return jsonResponse(200, rpcResult(id, {
          protocolVersion: SERVER.protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: SERVER.name, version: SERVER.version },
        }));
      }

      if (rpc.method === "tools/list") return jsonResponse(200, rpcResult(id, { tools: listTools() }));
      if (rpc.method !== "tools/call") return jsonResponse(200, rpcError(id, -32601, "method_not_found"));

      const tool = TOOL_BY_NAME[String(rpc?.params?.name ?? "")];
      if (!tool) return jsonResponse(200, rpcError(id, -32602, "unknown_tool"));

      const identity = typeof authenticate === "function" ? await authenticate(request.headers ?? {}) : null;
      if (!identity) return jsonResponse(200, rpcError(id, -32001, "unauthorized"));
      if (!hasScope(identity, tool.scope)) return jsonResponse(200, rpcError(id, -32003, "insufficient_scope", { requiredScope: tool.scope }));

      const args = rpc.params?.arguments ?? {};
      const argError = validateArgs(tool.name, args);
      if (argError) return jsonResponse(200, rpcError(id, -32602, argError));

      if (tool.name === "mitra.status") {
        return jsonResponse(200, rpcResult(id, toolPayload({ ok: true, service: SERVER.name, tenantId: tenantOf(identity), generatedAt: now() })));
      }
      if (tool.name === "mitra.capabilities") {
        return jsonResponse(200, rpcResult(id, toolPayload({ ok: true, service: SERVER.name, tenantId: tenantOf(identity), tools: TOOLS.map(({ name, scope, backend }) => ({ name, scope, backend, readOnly: true })) })));
      }

      try {
        const payload = await callLex({ name: tool.name, args, identity, lexClient });
        return jsonResponse(200, rpcResult(id, toolPayload(payload)));
      } catch (error) {
        return jsonResponse(200, rpcResult(id, toolPayload({ ok: false, error: "dependency_error", reason: safe(error?.message), needsHumanReview: true })));
      }
    },
  });
}

export const mitraMcpV1Contract = Object.freeze({ ...SERVER, tools: TOOLS });
