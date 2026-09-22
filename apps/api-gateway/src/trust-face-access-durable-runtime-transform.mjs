import { resolve } from "node:path";

import { createFileTrustFaceAccessDurableStore } from "./trust-face-access-durable-store.mjs";
import { createTrustFaceAccessDurableService } from "./trust-face-access-durable-service.mjs";

const JSON_HEADERS = Object.freeze({ "content-type": "application/json; charset=utf-8" });

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"]
    .includes(String(value ?? "").trim().toLowerCase());
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function resolveStorePath({ env = process.env, cwd = process.cwd(), config } = {}) {
  const explicitPath = optionalText(env.TRUST_FACE_ACCESS_DURABLE_STORE_FILE);
  if (explicitPath) return resolve(cwd, explicitPath);

  const stateFilePath = optionalText(config?.stateFilePath);
  if (stateFilePath) return `${stateFilePath}.trust-face-access.json`;

  return resolve(cwd, ".trust-face-access.json");
}

async function readBody(request) {
  if (!{"POST": true, "PUT": true, "PATCH": true }[String(request.method ?? "GET").toUpperCase()]) {
    return undefined;
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function parseJsonObject(raw) {
  if (raw === undefined || String(raw).trim() === "") return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("json_object_body_required");
  }
  return parsed;
}

function trustPath(request) {
  const url = new URL(request.url, "https://gateway.apidevelopers.digital");
  return url.pathname;
}

function normalizeThisResponse(response) {
  return response;
}

async function handleTrustFaceAccessRequest({request, trustFaceAccess }) {
  const method = String(request.method ?? "GET").toUpperCase();
  const path = trustPath(request);

  if (method === "GET" && path === "/v1/trust/face-access/status") {
    return jsonResponse(200, trustFaceAccess.status());
  }

  if (method !== "POST") return undefined;

  const body = parseJsonObject(await readBody(request));

  if (path === "/v1/trust/face-access/register/options") {
    return jsonResponse(200, await trustFaceAccess.createRegistrationOptions(body));
  }
  if (path === "/v1/trust/face-access/register/verify") {
    return jsonResponse(200, await trustFaceAccess.verifyRegistrationPreview(body));
  }
  if (path === "/v1/trust/face-access/authenticate/options") {
    return jsonResponse(200, await trustFaceAccess.createAuthenticationOptions(body));
  }
  if (path === "/v1/trust/face-access/authenticate/verify") {
    return jsonResponse(200, await trustFaceAccess.verifyAuthenticationPreview(body));
  }

  return undefined;
}

export function createTrustFaceAccessDurableRuntimeTransform({
  env = process.env,
  cwd = process.cwd(),
  config = {},
  createStore = createFileTrustFaceAccessDurableStore,
  createService = createTrustFaceAccessDurableService,
} = {}) {
  if (!isEnabled(env.TRUST_FACE_ACCESS_DURABLE_PREVIEW)) return undefined;

  const storePath = resolveStorePath({ env, cwd, config });
  const store = createStore({ path: storePath });
  const trustFaceAccess = createService({
    store,
    ...(optionalText(env.TRUST_FACE_ACCESS_RP_ID) ? { rpId: optionalText(env.TRUST_FACE_ACCESS_RP_ID) } : {}),
    ...(optionalText(env.TRUST_FACE_ACCESS_ORIGIN) ? { origin: optionalText(env.TRUST_FACE_ACCESS_ORIGIN) } : {}),
  });

  return Object.freeze({
    enabled: true,
    storePath,
    trustFaceAccess,
  });
}

export function attachTrustFaceAccessDurablePreviewToGateway({
  gateway,
  env = process.env,
  cwd = process.cwd(),
  config = {},
  runtime = createTrustFaceAccessDurableRuntimeTransform({ env, cwd, config }),
} = {}) {
  if (!gateway || typeof gateway.app?.handleRequest !== "function") {
    throw new TypeError("gateway.app.handleRequest must be a function");
  }
  if (!runtime?.enabled) return gateway;

  return Object.freeze({
    ...gateway,
    app: Object.freeze({
      ...gateway.app,
      async handleRequest(request) {
        const durableResponse = await handleTrustFaceAccessRequest({
          request,
          trustFaceAccess: runtime.trustFaceAccess,
        });
        if (durableResponse) return normalizeThisResponse(durableResponse);
        return gateway.app.handleRequest(request);
      },
    }),
    trustFaceAccessDurablePreview: Object.freeze({
      storePath: runtime.storePath,
      status: runtime.trustFaceAccess.status(),
    }),
    trustFaceAccess: runtime.trustFaceAccess,
  });
}
