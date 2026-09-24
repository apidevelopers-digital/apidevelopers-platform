const BOOTSTRAP_CREATE_ROUTE = "/v1/operator/hostinger/mysql/unijuri-staging/create-bootstrap";
const REQUIRED_CONFIRMATION =
  "IGOR_APROVA_CRIAR_BANCO_MYSQL_UNIJURI_STAGING_20260922";

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

function readPasswordBytes(body) {
  if (body instanceof Uint8Array) return Buffer.from(body);
  if (Buffer.isBuffer(body)) return Buffer.from(body);
  if (typeof body === "string") return Buffer.from(body, "utf8");
  throw new TypeError("password body must be an octet-stream or string");
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
    // Keep generic sanitized code.
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
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest is required");
  if (typeof fetchImpl !== "function") throw new TypeError("fetch implementation is required");

  return Object.freeze({
    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const parsedUrl = new URL(request.url ?? "/", "https://api-gateway.local");
      const path = parsedUrl.pathname;

      if (path !== BOOTSTRAP_CREATE_ROUTE) {
        return app.handleRequest(request);
      }

      if (method !== "POST") {
        return jsonResponse(405, { ok: false, error: "method_not_allowed" });
      }

      const confirmation = readHeader(request.headers, "x-operation-confirmation");
      if (confirmation !== REQUIRED_CONFIRMATION) {
        return jsonResponse(428, {
          ok: false,
          error: "explicit_confirmation_required",
          requiredConfirmation: REQUIRED_CONFIRMATION,
          productionChanged: false,
          secretReturned: false,
        });
      }

      let passwordBytes;
      try {
        passwordBytes = readPasswordBytes(request.body);
        if (passwordBytes.length < 8 || passwordBytes.length > 256) {
          throw new TypeError("password length is invalid");
        }
      } catch (error) {
        return jsonResponse(400, {
          ok: false,
          error: "invalid_password_body",
          message: error instanceof Error ? error.message : "invalid password body",
          productionChanged: false,
          secretReturned: false,
        });
      }

      try {
        const result = await callHostingerCreateDatabase({ env, passwordBytes, fetchImpl });
        return jsonResponse(201, {
          ok: true,
          operation: "operator.hostinger.database.create-bootstrap",
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
      } finally {
        if (passwordBytes) passwordBytes.fill(0);
      }
    },
  });
}
