const EMBEDDED_BASE_URL = "https://mitra-embedded-lex.invalid";

function jsonResponse(status, payload) {
  const body = JSON.stringify(payload ?? null);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "content-type": "application/json" }),
    async text() {
      return body;
    },
    async json() {
      return payload ?? null;
    },
  };
}

function createMitraEmbeddedLexTransport({
  dispatch,
  baseUrl = EMBEDDED_BASE_URL,
} = {}) {
  if (typeof dispatch !== "function") {
    throw new TypeError("dispatch function is required");
  }

  const normalizedBase = String(baseUrl || "").replace(/\/+$/, "");

  return Object.freeze({
    baseUrl: normalizedBase,
    fetchImpl: async (url, options = {}) => {
      const target = String(url);
      if (target !== `${normalizedBase}/mitra/orchestrator/dispatch`) {
        return jsonResponse(404, {
          ok: false,
          status: "embedded_transport_route_not_found",
          read_only: true,
          persistence: false,
          database_write_allowed: false,
          write_executed: false,
        });
      }

      const method = String(options.method || "GET").toUpperCase();
      if (method !== "POST") {
        return jsonResponse(405, {
          ok: false,
          status: "embedded_transport_method_not_allowed",
          read_only: true,
          write_executed: false,
        });
      }

      let body;
      try {
        body = typeof options.body === "string" ? JSON.parse(options.body) : options.body ?? {};
      } catch {
        return jsonResponse(400, {
          ok: false,
          status: "embedded_transport_invalid_json",
          read_only: true,
          write_executed: false,
        });
      }

      try {
        const result = await dispatch(body);
        const status = Number(result?.http) || 500;
        return jsonResponse(status, result?.payload ?? {
          ok: false,
          status: "embedded_transport_invalid_output",
          read_only: true,
          write_executed: false,
        });
      } catch {
        return jsonResponse(502, {
          ok: false,
          status: "embedded_transport_dispatch_failed",
          read_only: true,
          persistence: false,
          database_write_allowed: false,
          write_executed: false,
        });
      }
    },
  });
}

export { EMBEDDED_BASE_URL, createMitraEmbeddedLexTransport };
