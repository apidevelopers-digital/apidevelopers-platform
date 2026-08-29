import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  authorizeExecution,
  normalizeMethod,
  normalizePath,
  normalizeProvider,
  sanitizePayload
} from "./policy.mjs";

const PORT = Number(process.env.PORT || 8787);
const CLIENT_SLUG = process.env.CLIENT_SLUG || "petra-advocacia";
const ACTION_GATEWAY_TOKEN = process.env.ACTION_GATEWAY_TOKEN || "";
const GITHUB_TOKEN = process.env.PETRA_GITHUB_TOKEN || "";
const HOSTINGER_TOKEN = process.env.PETRA_HOSTINGER_TOKEN || "";
const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || "2022-11-28";

const PROVIDERS = Object.freeze({
  github: {
    baseUrl: "https://api.github.com",
    token: GITHUB_TOKEN,
    headers: {
      accept: "application/vnd.github+json",
      "x-github-api-version": GITHUB_API_VERSION,
      "user-agent": "api-developers-digital-client-operator"
    }
  },
  hostinger: {
    baseUrl: "https://developers.hostinger.com",
    token: HOSTINGER_TOKEN,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "api-developers-digital-client-operator"
    }
  }
});

function json(res, status, body) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(JSON.stringify(body));
}

function isGatewayAuthorized(req) {
  if (!ACTION_GATEWAY_TOKEN) return false;
  return req.headers.authorization === `Bearer ${ACTION_GATEWAY_TOKEN}`;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  if (text.length > 1_000_000) throw new Error("request_too_large");
  return JSON.parse(text);
}

function makeUrl(baseUrl, path, query = {}) {
  const url = new URL(path, baseUrl);
  for (const [key, value] of Object.entries(query || {})) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) {
      for (const item of value) url.searchParams.append(key, String(item));
    } else {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function executeProviderRequest({ provider, method, path, query, body, requestId }) {
  const config = PROVIDERS[provider];
  if (!config.token) {
    return {
      status: 503,
      payload: {
        ok: false,
        requestId,
        client: CLIENT_SLUG,
        provider,
        code: "provider_not_configured"
      }
    };
  }

  const url = makeUrl(config.baseUrl, path, query);
  const headers = {
    ...config.headers,
    authorization: `Bearer ${config.token}`
  };

  const response = await fetch(url, {
    method,
    headers,
    body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify(body ?? {}),
    signal: AbortSignal.timeout(30_000)
  });

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { raw: text.slice(0, 20_000) };
    }
  }

  return {
    status: response.status,
    payload: {
      ok: response.ok,
      requestId,
      client: CLIENT_SLUG,
      provider,
      upstreamStatus: response.status,
      data: sanitizePayload(payload),
      correlationId:
        response.headers.get("x-github-request-id") ||
        response.headers.get("x-correlation-id") ||
        null
    }
  };
}

const server = http.createServer(async (req, res) => {
  const requestId = randomUUID();

  try {
    const url = new URL(req.url, "http://localhost");

    if (req.method === "GET" && url.pathname === "/health") {
      return json(res, 200, {
        ok: true,
        requestId,
        client: CLIENT_SLUG,
        gatewayConfigured: Boolean(ACTION_GATEWAY_TOKEN),
        providers: {
          github: Boolean(GITHUB_TOKEN),
          hostinger: Boolean(HOSTINGER_TOKEN)
        }
      });
    }

    if (req.method !== "POST" || !["/v1/github/execute", "/v1/hostinger/execute"].includes(url.pathname)) {
      return json(res, 404, { ok: false, requestId, code: "not_found" });
    }

    if (!isGatewayAuthorized(req)) {
      return json(res, 401, { ok: false, requestId, code: "gateway_unauthorized" });
    }

    const provider = normalizeProvider(url.pathname.includes("/github/") ? "github" : "hostinger");
    const input = await readJson(req);
    const method = normalizeMethod(input.method);
    const path = normalizePath(provider, input.path);
    const decision = authorizeExecution({
      method,
      dryRun: input.dry_run !== false,
      confirmacao: input.confirmacao || ""
    });

    const audit = {
      requestId,
      client: CLIENT_SLUG,
      provider,
      method,
      path,
      risk: decision.risk,
      dryRun: input.dry_run !== false,
      executed: decision.execute,
      timestamp: new Date().toISOString()
    };
    console.log(JSON.stringify(audit));

    if (!decision.allowed) {
      return json(res, 403, {
        ok: false,
        ...audit,
        code: decision.reason,
        expected: decision.expected
      });
    }

    if (!decision.execute) {
      return json(res, 200, {
        ok: true,
        ...audit,
        mode: "dry-run",
        plannedRequest: sanitizePayload({
          method,
          path,
          query: input.query || {},
          body: input.body || {}
        })
      });
    }

    const result = await executeProviderRequest({
      provider,
      method,
      path,
      query: input.query || {},
      body: input.body || {},
      requestId
    });

    return json(res, result.status, {
      ...result.payload,
      audit
    });
  } catch (error) {
    console.error(JSON.stringify({
      requestId,
      client: CLIENT_SLUG,
      error: error?.message || "unknown_error"
    }));
    return json(res, 400, {
      ok: false,
      requestId,
      client: CLIENT_SLUG,
      code: error?.message || "invalid_request"
    });
  }
});

server.listen(PORT, () => {
  console.log(JSON.stringify({
    event: "client_operator_actions_started",
    client: CLIENT_SLUG,
    port: PORT,
    githubConfigured: Boolean(GITHUB_TOKEN),
    hostingerConfigured: Boolean(HOSTINGER_TOKEN)
  }));
});
