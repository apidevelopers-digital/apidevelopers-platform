import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createFileTrustFaceAccessDurableStore } from "./trust-face-access-durable-store.mjs";
import { createTrustFaceAccessDurableService } from "./trust-face-access-durable-service.mjs";

const JSON_HEADERS = Object.freeze({ "content-type": "application/json; charset=utf-8" });

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"].includes(String(value ?? "").trim().toLowerCase());
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

function pathSegments(value) {
  return String(value ?? "").split(/[\\/]+/u).filter(Boolean);
}

function operationalRootFromCwd(cwd) {
  const segments = pathSegments(cwd);
  const tail = segments.slice(-3).join("/");
  if (tail === "hbuilds/current/nodejs") {
    return resolve(cwd, "../../..");
  }
  return resolve(cwd, "../../..");
}

function defaultFileFlagPath({ cwd = process.cwd() } = {}) {
  return resolve(
    operationalRootFromCwd(cwd),
    "public_html",
    ".trust-face-access-durable-preview",
  );
}

function defaultStorePath({ cwd = process.cwd() } = {}) {
  return resolve(
    operationalRootFromCwd(cwd),
    "public_html",
    ".trust-face-access-durable-store.json",
  );
}

function configuredFlagPath({ env = process.env, cwd = process.cwd() } = {}) {
  const explicitPath = optionalText(env.TRUST_FACE_ACCESS_DURABLE_FLAG_FILE);
  return explicitPath ? resolve(cwd, explicitPath) : defaultFileFlagPath({ cwd });
}

function safeExists(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}

function isFileFlagEnabled({ env = process.env, cwd = process.cwd() } = {}) {
  return safeExists(configuredFlagPath({ env, cwd }));
}

function isDurablePreviewEnabled({ env = process.env, cwd = process.cwd() } = {}) {
  return isEnabled(env.TRUST_FACE_ACCESS_DURABLE_PREVIEW) || isFileFlagEnabled({ env, cwd });
}

function resolveStorePath({ env = process.env, cwd = process.cwd(), config } = {}) {
  const explicitPath = optionalText(env.TRUST_FACE_ACCESS_DURABLE_STORE_FILE);
  if (explicitPath) return resolve(cwd, explicitPath);

  const stateFilePath = optionalText(config?.stateFilePath);
  if (stateFilePath) return `${stateFilePath}.trust-face-access.json`;

  return defaultStorePath({ cwd });
}

function createDiagnostics({
  env = process.env,
  cwd = process.cwd(),
  config,
  runtime,
} = {}) {
  const fileFlagPath = configuredFlagPath({ env, cwd });
  const storePath = resolveStorePath({ env, cwd, config });

  return Object.freeze({
    transformAttached: true,
    durableRuntimeEnabled: Boolean(runtime?.enabled),
    envFlagEnabled: isEnabled(env.TRUST_FACE_ACCESS_DURABLE_PREVIEW),
    fileFlagPath,
    fileFlagExists: safeExists(fileFlagPath),
    storePath,
    cwd,
    operationalRoot: operationalRootFromCwd(cwd),
  });
}

async function readBody(request) {
  if (!{ POST: true, PUT: true, PATCH: true }[String(request.method ?? "GET").toUpperCase()]) {
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

async function handleTrustFaceAccessRequest({ request, trustFaceAccess, diagnostics }) {
  const method = String(request.method ?? "GET").toUpperCase();
  const pathname = trustPath(request);

  if (method === "GET" && pathname === "/v1/trust/face-access/status") {
    const status = trustFaceAccess?.status ? trustFaceAccess.status() : {
      service: "trust-face-access",
      status: "preview",
      mode: "passkeys_webauthn",
      rpId: "apidevelopers.digital",
      origin: "https://trust.apidevelopers.digital",
      storesBiometricTemplate: false,
      storesFaceImage: false,
    };

    return jsonResponse(200, {
      ...status,
      diagnostics,
    });
  }

  if (!trustFaceAccess || method !== "POST") return undefined;

  const body = parseJsonObject(await readBody(request));

  if (pathname === "/v1/trust/face-access/register/options") {
    return jsonResponse(200, await trustFaceAccess.createRegistrationOptions(body));
  }
  if (pathname === "/v1/trust/face-access/register/verify") {
    return jsonResponse(200, await trustFaceAccess.verifyRegistrationPreview(body));
  }
  if (pathname === "/v1/trust/face-access/authenticate/options") {
    return jsonResponse(200, await trustFaceAccess.createAuthenticationOptions(body));
  }
  if (pathname === "/v1/trust/face-access/authenticate/verify") {
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
  if (!isDurablePreviewEnabled({ env, cwd })) return undefined;

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

  const diagnostics = createDiagnostics({ env, cwd, config, runtime });

  return Object.freeze({
    ...gateway,
    app: Object.freeze({
      ...gateway.app,
      async handleRequest(request) {
        const durableResponse = await handleTrustFaceAccessRequest({
          request,
          trustFaceAccess: runtime?.trustFaceAccess,
          diagnostics,
        });
        if (durableResponse) return durableResponse;
        return gateway.app.handleRequest(request);
      },
    }),
    trustFaceAccessDurablePreview: Object.freeze({
      storePath: diagnostics.storePath,
      status: runtime?.trustFaceAccess?.status?.(),
      diagnostics,
    }),
    ...(runtime?.trustFaceAccess ? { trustFaceAccess: runtime.trustFaceAccess } : {}),
  });
}
