export const uniCoPreviewLoginHttpPath = "/v1/web-agent/session/login";

const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
});

function response(status, payload, headers = {}) {
  return Object.freeze({
    status,
    headers: Object.freeze({ ...JSON_HEADERS, ...headers }),
    body: JSON.stringify(payload),
  });
}

function parseJsonBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body)) return body;
  if (typeof body !== "string" || body.trim() === "") {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    const error = new Error("invalid_json");
    error.status = 400;
    throw error;
  }
  return parsed;
}

function safeError(error) {
  const code = String(error?.message ?? "preview_login_failed");

  if (
    code === "invalid_credentials" ||
    code === "preview_identity_verification_failed"
  ) {
    return { status: 401, code: "invalid_credentials" };
  }

  if (
    code === "access_grant_not_found" ||
    code === "access_grant_ambiguous" ||
    code === "active_access_grant_scope_mismatch" ||
    code === "preview_identity_binding_required" ||
    code === "preview_product_not_allowed" ||
    code === "preview_login_surface_not_allowed"
  ) {
    return { status: 403, code };
  }

  if (error?.status === 400) return { status: 400, code };
  if (error?.status === 401) return { status: 401, code: "invalid_credentials" };
  if (error?.status === 403) return { status: 403, code };

  return { status: 503, code: "preview_login_unavailable" };
}

export function createUniCoPreviewLoginHttpApp({ app, bootstrap } = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest is required");
  }

  if (typeof bootstrap?.login !== "function") {
    return Object.freeze({
      enabled: false,
      app,
    });
  }

  const wrapped = Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const pathname = new URL(
        String(request.url ?? "/"),
        "http://api-gateway.local",
      ).pathname;

      if (method !== "POST" || pathname !== uniCoPreviewLoginHttpPath) {
        return app.handleRequest(request);
      }

      try {
        const payload = parseJsonBody(request.body);
        const result = await bootstrap.login({
          host: request.headers?.host,
          email: payload.email,
          password: payload.password,
        });

        return response(
          200,
          {
            ok: true,
            authenticated: true,
            productId: result.productId,
            agentId: result.agentId,
            workspaceId: result.workspaceId,
            accessGrantId: result.accessGrantId,
            expiresAt: result.expiresAt,
          },
          { "set-cookie": result.setCookie },
        );
      } catch (error) {
        const failure = safeError(error);
        return response(failure.status, {
          ok: false,
          authenticated: false,
          error: failure.code,
        });
      }
    },
  });

  return Object.freeze({
    enabled: true,
    app: wrapped,
  });
}
