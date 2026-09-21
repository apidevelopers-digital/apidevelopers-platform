import { resolve } from "node:path";

import { createFileTrustFaceAccessDurableStore } from "./trust-face-access-durable-store.mjs";
import { createTrustFaceAccessDurableService } from "./trust-face-access-durable-service.mjs";

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function isEnabled(value) {
  return ["1", "true", "yes", "on"]
    .includes(String(value ?? "").trim().toLowerCase());
}

function resolveStorePath({ env = process.env, cwd = process.cwd(), config } = {}) {
  const explicitPath = optionalText(env.TRUST_FACE_ACCESS_DURABLE_STORE_FILE);
  if (explicitPath) return resolve(cwd, explicitPath);

  const stateFilePath = optionalText(config?.stateFilePath);
  if (stateFilePath) return `${stateFilePath}.trust-face-access.json`;

  return resolve(cwd, ".trust-face-access.json");
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
