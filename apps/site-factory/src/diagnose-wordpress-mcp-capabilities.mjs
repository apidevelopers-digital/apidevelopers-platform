#!/usr/bin/env node
import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";

const API_BASE = "https://developers.hostinger.com";
const USERNAME = process.env.HOSTINGER_USERNAME ?? "u242521810";
const SOFTWARE_ID = process.env.WORDPRESS_SOFTWARE_ID ?? "29782684";
const DOMAIN = process.env.TARGET_DOMAIN ?? "apidevelopers.digital";
const API_TOKEN = process.env.HOSTINGER_API_TOKEN ?? "";
const OUTPUT_PATH =
  process.env.EVIDENCE_PATH ??
  "apps/site-factory/diagnostics/wordpress-mcp-capabilities.json";

const SECRET_KEY = /token|authorization|secret|password|cookie|jwt|private[_-]?key/i;

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function sanitize(value) {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? "[REDACTED]" : sanitize(item),
      ]),
    );
  }
  if (typeof value === "string" && value.length > 20000) {
    return `${value.slice(0, 20000)}...[TRUNCATED]`;
  }
  return value;
}

function parseJsonOrSse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const dataLines = text
      .split(/\r?\n/)
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);
    for (let index = dataLines.length - 1; index >= 0; index -= 1) {
      try {
        return JSON.parse(dataLines[index]);
      } catch {
        // Try earlier data line.
      }
    }
    return { raw: text.slice(0, 20000) };
  }
}

async function fetchText(url, options = {}, timeoutMs = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    return { response, text };
  } finally {
    clearTimeout(timeout);
  }
}

async function hostingerJwt() {
  const url = `${API_BASE}/api/hosting/v1/accounts/${encodeURIComponent(
    USERNAME,
  )}/wordpress/${encodeURIComponent(SOFTWARE_ID)}/jwt-token`;

  const { response, text } = await fetchText(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${required("HOSTINGER_API_TOKEN", API_TOKEN)}`,
      "user-agent": "apidevelopers-platform/site-factory-wordpress-mcp-diagnostic",
    },
  });

  const payload = parseJsonOrSse(text);
  if (!response.ok) {
    const error = new Error(`hostinger_jwt_failed:${response.status}`);
    error.evidence = {
      status: response.status,
      statusText: response.statusText,
      payload: sanitize(payload),
      correlationId:
        response.headers.get("x-correlation-id") ??
        payload?.correlation_id ??
        payload?.correlationId ??
        null,
    };
    throw error;
  }

  const token = payload?.token;
  const mcpUrl = payload?.mcp_url;
  required("wordpress_jwt", token);
  required("mcp_url", mcpUrl);

  const parsedUrl = new URL(mcpUrl);
  if (parsedUrl.protocol !== "https:" || parsedUrl.hostname !== DOMAIN) {
    throw new Error(`unexpected_mcp_url:${parsedUrl.origin}${parsedUrl.pathname}`);
  }

  return {
    token,
    mcpUrl,
    meta: {
      status: response.status,
      expiresIn: payload?.expires_in ?? null,
      expiresAt: payload?.expires_at ?? null,
      mcpUrl: `${parsedUrl.origin}${parsedUrl.pathname}`,
      tokenSha256: sha256(token),
    },
  };
}

function mcpHeaders(jwt, sessionId) {
  const headers = {
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${jwt}`,
    "content-type": "application/json",
    "user-agent": "apidevelopers-platform/site-factory-wordpress-mcp-diagnostic",
  };
  if (sessionId) headers["mcp-session-id"] = sessionId;
  return headers;
}

async function mcpCall({ mcpUrl, jwt, sessionId, body }) {
  const { response, text } = await fetchText(
    mcpUrl,
    {
      method: "POST",
      headers: mcpHeaders(jwt, sessionId),
      body: JSON.stringify(body),
      redirect: "follow",
    },
    45000,
  );

  return {
    status: response.status,
    ok: response.ok,
    sessionId: response.headers.get("mcp-session-id") ?? sessionId ?? null,
    contentType: response.headers.get("content-type"),
    payload: parseJsonOrSse(text),
    bodySha256: sha256(text),
  };
}

async function initializeMcp(mcpUrl, jwt) {
  const candidates = ["2025-06-18", "2025-03-26", "2024-11-05"];
  const attempts = [];

  for (const protocolVersion of candidates) {
    const result = await mcpCall({
      mcpUrl,
      jwt,
      body: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion,
          capabilities: {},
          clientInfo: {
            name: "apidevelopers-platform-site-factory",
            version: "1.0.0",
          },
        },
      },
    });

    attempts.push({
      protocolVersion,
      status: result.status,
      ok: result.ok,
      contentType: result.contentType,
      bodySha256: result.bodySha256,
      error: sanitize(result.payload?.error ?? null),
      serverProtocolVersion:
        result.payload?.result?.protocolVersion ??
        result.payload?.protocolVersion ??
        null,
    });

    if (result.ok && result.payload?.result) {
      return {
        protocolVersion:
          result.payload.result.protocolVersion ?? protocolVersion,
        sessionId: result.sessionId,
        serverInfo: sanitize(result.payload.result.serverInfo ?? null),
        capabilities: sanitize(result.payload.result.capabilities ?? null),
        attempts,
      };
    }
  }

  const error = new Error("mcp_initialize_failed");
  error.evidence = { attempts };
  throw error;
}

async function notifyInitialized(mcpUrl, jwt, sessionId) {
  const result = await mcpCall({
    mcpUrl,
    jwt,
    sessionId,
    body: {
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    },
  });
  return {
    status: result.status,
    ok: result.ok,
    contentType: result.contentType,
    bodySha256: result.bodySha256,
  };
}

function summarizeTools(payload) {
  const tools = payload?.result?.tools ?? [];
  return tools.map((tool) => ({
    name: tool?.name ?? null,
    description:
      typeof tool?.description === "string"
        ? tool.description.slice(0, 1000)
        : null,
    required:
      Array.isArray(tool?.inputSchema?.required)
        ? tool.inputSchema.required
        : [],
    properties:
      tool?.inputSchema?.properties &&
      typeof tool.inputSchema.properties === "object"
        ? Object.fromEntries(
            Object.entries(tool.inputSchema.properties).map(([name, schema]) => [
              name,
              {
                type: schema?.type ?? null,
                description:
                  typeof schema?.description === "string"
                    ? schema.description.slice(0, 500)
                    : null,
                enum: Array.isArray(schema?.enum) ? schema.enum : undefined,
              },
            ]),
          )
        : {},
  }));
}

async function listCapability(mcpUrl, jwt, sessionId, method, id) {
  const result = await mcpCall({
    mcpUrl,
    jwt,
    sessionId,
    body: { jsonrpc: "2.0", id, method, params: {} },
  });
  return {
    status: result.status,
    ok: result.ok,
    contentType: result.contentType,
    bodySha256: result.bodySha256,
    payload: sanitize(result.payload),
  };
}

async function publicWordPressIndex() {
  const url = `https://${DOMAIN}/wp-json/`;
  const { response, text } = await fetchText(
    url,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "apidevelopers-platform/site-factory-wordpress-mcp-diagnostic",
      },
      redirect: "follow",
    },
    30000,
  );

  const payload = parseJsonOrSse(text);
  const namespaces = Array.isArray(payload?.namespaces)
    ? payload.namespaces.filter((value) => typeof value === "string")
    : [];
  const routes = payload?.routes && typeof payload.routes === "object"
    ? Object.keys(payload.routes).filter(
        (route) =>
          route.includes("hostinger") ||
          route.includes("wp/v2/pages") ||
          route.includes("wp/v2/templates"),
      )
    : [];

  return {
    status: response.status,
    ok: response.ok,
    finalUrl: response.url,
    contentType: response.headers.get("content-type"),
    bodySha256: sha256(text),
    namespaces,
    relevantRoutes: routes,
  };
}

async function main() {
  const generatedAt = new Date().toISOString();
  let evidence = {
    schemaVersion: "1.0",
    kind: "site-factory-wordpress-mcp-capabilities",
    generatedAt,
    source: {
      repository: process.env.GITHUB_REPOSITORY ?? null,
      branch: process.env.GITHUB_REF_NAME ?? null,
      sha: process.env.GITHUB_SHA ?? null,
      runId: process.env.GITHUB_RUN_ID ?? null,
    },
    target: {
      username: USERNAME,
      domain: DOMAIN,
      softwareId: SOFTWARE_ID,
    },
    writeExecuted: false,
    wordpressDeleted: false,
    dnsChanged: false,
  };

  try {
    const publicIndex = await publicWordPressIndex();
    const jwtDetails = await hostingerJwt();
    const initialized = await initializeMcp(
      jwtDetails.mcpUrl,
      jwtDetails.token,
    );
    const notification = await notifyInitialized(
      jwtDetails.mcpUrl,
      jwtDetails.token,
      initialized.sessionId,
    );
    const toolsResult = await listCapability(
      jwtDetails.mcpUrl,
      jwtDetails.token,
      initialized.sessionId,
      "tools/list",
      2,
    );
    const resourcesResult = await listCapability(
      jwtDetails.mcpUrl,
      jwtDetails.token,
      initialized.sessionId,
      "resources/list",
      3,
    );
    const promptsResult = await listCapability(
      jwtDetails.mcpUrl,
      jwtDetails.token,
      initialized.sessionId,
      "prompts/list",
      4,
    );

    evidence = {
      ...evidence,
      status: "completed",
      publicWordPressIndex: publicIndex,
      hostingerJwt: jwtDetails.meta,
      mcp: {
        protocolVersion: initialized.protocolVersion,
        serverInfo: initialized.serverInfo,
        capabilities: initialized.capabilities,
        initializeAttempts: initialized.attempts,
        initializedNotification: notification,
        sessionIdPresent: Boolean(initialized.sessionId),
        tools: {
          status: toolsResult.status,
          ok: toolsResult.ok,
          bodySha256: toolsResult.bodySha256,
          items: summarizeTools(toolsResult.payload),
          error: sanitize(toolsResult.payload?.error ?? null),
        },
        resources: {
          status: resourcesResult.status,
          ok: resourcesResult.ok,
          bodySha256: resourcesResult.bodySha256,
          count: Array.isArray(resourcesResult.payload?.result?.resources)
            ? resourcesResult.payload.result.resources.length
            : 0,
          error: sanitize(resourcesResult.payload?.error ?? null),
        },
        prompts: {
          status: promptsResult.status,
          ok: promptsResult.ok,
          bodySha256: promptsResult.bodySha256,
          count: Array.isArray(promptsResult.payload?.result?.prompts)
            ? promptsResult.payload.result.prompts.length
            : 0,
          error: sanitize(promptsResult.payload?.error ?? null),
        },
      },
    };
  } catch (error) {
    evidence = {
      ...evidence,
      status: "error",
      error: {
        message: error instanceof Error ? error.message : String(error),
        evidence: sanitize(error?.evidence ?? null),
      },
    };
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });

  console.log(
    JSON.stringify({
      status: evidence.status,
      evidencePath: OUTPUT_PATH,
      toolCount: evidence?.mcp?.tools?.items?.length ?? 0,
      writeExecuted: false,
    }),
  );

  if (evidence.status !== "completed") process.exitCode = 1;
}

await main();
