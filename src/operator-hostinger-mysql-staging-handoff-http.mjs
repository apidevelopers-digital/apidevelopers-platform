const SESSION_ROUTE = "/v1/operator/hostinger/mysql/unijuri-staging/secret-handoff-session";
const CREATE_ROUTE = "/v1/operator/hostinger/mysql/unijuri-staging/create";
const REQUIRED_SCOPE = "admin:*";

export const UNIJURI_MYSQL_STAGING_CREATE_CONFIRMATION =
  "IGOR_APROVA_CRIAR_BANCO_MYSQL_UNIJURI_STAGING_20260922";

const PURPOSE = "hostinger.mysql.unijuri_staging.password";
const DATABASE_NAME = "unijuri_staging";
const DATABASE_USER = "unijuri_staging";
const WEBSITE_DOMAIN = "gateway.apidevelopers.digital";
const DEFAULT_USERNAME = "u242521810";
const HOSTINGER_API_BASE = "https://developers.hostinger.com/api/hosting/v1";

const RESPONSE_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
});

function jsonResponse(status, payload) {
  return Object.freeze({
    status,
    headers: RESPONSE_HEADERS,
    body: JSON.stringify(payload),
  });
}

function readHeader(headers, name) {
  const expected = name.toLowerCase();
  for (const [key, value] of Object.entries(headers ?? {})) {
    if (key.toLowerCase() === expected) return String(value ?? "").trim() || undefined;
  }
  return undefined;
}

function parseBody(body) {
  if (body && typeof body === "object" && !Array.isArray(body) && !(body instanceof Uint8Array)) {
    return body;
  }
  if (typeof body !== "string" || !body.trim()) return {};
  const parsed = JSON.parse(body);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new TypeError("request body must be a JSON object");
  }
  return parsed;
}

function hasAdminWildcard(identity) {
  const scopes = identity?.principal?.scopes;
  return Array.isArray(scopes) && scopes.includes(REQUIRED_SCOPE);
}

function requireText(value, field, pattern) {
  const normalized = String(value ?? "").trim();
  if (!pattern.test(normalized)) throw new TypeError(`${field} is invalid`);
  return normalized;
}

function publicError(error, fallback = "internal_error") {
  const value = String(error?.publicCode ?? error?.code ?? error?.message ?? fallback).trim();
  if (!value) return fallback;
  return value.replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 160);
}

function sanitizeHostingerError(status, bodyText) {
  let code = "hostinger_api_error";
  try {
    const parsed = JSON.parse(String(bodyText ?? ""));
    if (parsed && typeof parsed === "object" && typeof parsed.message === "string") {
      code = parsed.message.slice(0, 120);
    }
  } catch {
    // Keep the sanitized generic code.
  }
  return Object.freeze({ status, code });
}

async function callHostingerCreateDatabase({ env, passwordBytes, fetchImpl }) {
  const username = requireText(
    env.HOSTINGER_ACCOUNT_USERNAME ?? DEFAULT_USERNAME,
    "HOSTINGER_ACCOUNT_USERNAME",
    /^[a-zA-Z0-9_:-]{3,128}$/,
  );
  const token = String(env.HOSTINGER_API_TOKEN ?? env.HOSTINGER_BEARER_TOKEN ?? "").trim();
  if (!token) {
    throw Object.assign(new Error("hostinger API token is not configured"), {
      status: 503,
      publicCode: "hostinger_api_token_not_configured",
    });
  }

  const password = Buffer.from(passwordBytes).toString("utf8");
  const payload = {
    name: DATABASE_NAME,
    user: DATABASE_USER,
    password,
    website_domain: WEBSITE_DOMAIN,
  };

  try {
    const response = await fetchImpl(
      `${HOSTINGER_API_BASE}/accounts/${encodeURIComponent(username)}/databases`,
      {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          accept: "application/json",
        },
        body: JSON.stringify(payload),
      },
    );

    const text = await response.text();
    if (!response.ok) {
      const sanitized = sanitizeHostingerError(response.status, text);
      throw Object.assign(new Error("hostinger database creation failed"), {
        status: response.status,
        publicCode: sanitized.code,
      });
    }

    let result = {};
    try {
      result = text ? JSON.parse(text) : {};
    } catch {
      result = {};
    }

    return Object.freeze({
      ok: true,
      database: DATABASE_NAME,
      user: DATABASE_USER,
      websiteDomain: WEBSITE_DOMAIN,
      hostingerStatus: response.status,
      providerId: result?.id ?? result?.data?.id ?? null,
    });
  } finally {
    passwordBytes.fill(0);
  }
}

export function createOperatorHostingerMysqlStagingHandoffHttpApp({
  app,
  authenticator,
  authorization,
  handoffService,
  secretProvider,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate is required");
  if (typeof authorization?.decide !== "function") throw new TypeError("authorization.decide is required");
  if (typeof handoffService?.create !== "function") throw new TypeError("handoffService.create is required");
  if (typeof secretProvider?.withSecret !== "function") throw new TypeError("secretProvider.withSecret is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  async function authorize(request, action, resource) {
    let identity;
    try {
      identity = await authenticator.authenticate(request.headers ?? {});
    } catch {
      return { response: jsonResponse(401, { ok: false, error: "unauthorized" }) };
    }
    if (!identity) return { response: jsonResponse(401, { ok: false, error: "unauthorized" }) };

    let authorizationDecision;
    try {
      authorizationDecision = authorization.decide({
        identity,
        action,
        resource,
        requiredScopes: [REQUIRED_SCOPE],
      });
    } catch {
      return { response: jsonResponse(403, { ok: false, error: "forbidden" }) };
    }

    if (authorizationDecision?.effect !== "allow" || !hasAdminWildcard(identity)) {
      return { response: jsonResponse(403, { ok: false, error: "forbidden" }) };
    }

    return { identity, authorizationDecision };
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(request.url ?? "/", "https://api-gateway.local");
      const path = parsedUrl.pathname;

      if (path !== SESSION_ROUTE && path !== CREATE_ROUTE) {
        return app.handleRequest(request);
      }

      if (method !== "POST") {
        return jsonResponse(405, { ok: false, error: "method_not_allowed" });
      }

      const auth = await authorize(
        request,
        path === SESSION_ROUTE
          ? "operator.hostinger.database.create-with-secret-handoff.session"
          : "operator.hostinger.database.create-with-secret-handoff",
        "institution:hostinger:mysql:unijuri_staging",
      );
      if (auth.response) return auth.response;

      if (path === SESSION_ROUTE) {
        try {
          const session = handoffService.create({
            purpose: PURPOSE,
            metadata: Object.freeze({
              database: DATABASE_NAME,
              user: DATABASE_USER,
              websiteDomain: WEBSITE_DOMAIN,
              operation: "operator.hostinger.database.create-with-secret-handoff",
            }),
          });

          return jsonResponse(201, {
            ok: true,
            sessionId: session.sessionId,
            submitUrl: `/v1/operator/secret-handoff/${session.sessionId}/submit`,
            submitToken: session.submitToken,
            secretRef: `secret://handoff/${session.sessionId}`,
            purpose: PURPOSE,
            expiresAt: session.expiresAt,
            contentType: "application/octet-stream",
            tokenHeader: "x-secret-handoff-token",
            secretReturned: false,
            productionChanged: false,
          });
        } catch (error) {
          return jsonResponse(500, {
            ok: false,
            error: publicError(error, "secret_handoff_session_create_failed"),
            productionChanged: false,
            secretReturned: false,
          });
        }
      }

      let body;
      try {
        body = parseBody(request.body);
      } catch {
        return jsonResponse(400, { ok: false, error: "invalid_json_body" });
      }

      const confirmation = readHeader(request.headers, "x-operation-confirmation") ?? body.confirmation;
      if (confirmation !== UNIJURI_MYSQL_STAGING_CREATE_CONFIRMATION) {
        return jsonResponse(428, {
          ok: false,
          error: "explicit_confirmation_required",
          requiredConfirmation: UNIJURI_MYSQL_STAGING_CREATE_CONFIRMATION,
          productionChanged: false,
          secretReturned: false,
        });
      }

      let secretRef;
      try {
        const allowed = new Set(["secretRef", "confirmation", "correlationId"]);
        for (const key of Object.keys(body)) {
          if (!allowed.has(key)) throw new TypeError("request contains an unsupported field");
        }
        secretRef = requireText(body.secretRef, "secretRef", /^secret:\/\/handoff\/[A-Za-z0-9._:-]{3,128}$/);
      } catch (error) {
        return jsonResponse(400, {
          ok: false,
          error: "invalid_create_request",
          message: error instanceof Error ? error.message : "invalid request",
          productionChanged: false,
          secretReturned: false,
        });
      }

      try {
        const result = await secretProvider.withSecret(
          Object.freeze({ secretRef, purpose: PURPOSE }),
          async (lease) =>
            callHostingerCreateDatabase({
              env,
              passwordBytes: Buffer.from(lease.bytes),
              fetchImpl,
            }),
        );

        return jsonResponse(201, {
          ok: true,
          operation: "operator.hostinger.database.create-with-secret-handoff",
          database: DATABASE_NAME,
          user: DATABASE_USER,
          websiteDomain: WEBSITE_DOMAIN,
          hostingerStatus: result.hostingerStatus,
          providerId: result.providerId,
          productionChanged: true,
          secretReturned: false,
        });
      } catch (error) {
        const status = Number.isInteger(error?.status) ? error.status : 500;
        return jsonResponse(status, {
          ok: false,
          error: publicError(error, "hostinger_database_create_failed"),
          productionChanged: false,
          secretReturned: false,
        });
      }
    },
  });
}
