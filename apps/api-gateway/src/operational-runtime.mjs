import { resolve } from "node:path";

import {
  createOperationalGatewayWithReadonlyOperator,
} from "./operator-readonly-composition.mjs";

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function optionalText(value) {
  const normalized = String(value ?? "").trim();
  return normalized || undefined;
}

function parsePort(value) {
  const normalized = String(value ?? "3000").trim();
  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 0 || port > 65535) {
    throw new TypeError("PORT must be an integer between 0 and 65535");
  }
  return port;
}

export function resolveOperationalRuntimeConfig({
  env = process.env,
  cwd = process.cwd(),
} = {}) {
  const stateFilePath = resolve(
    cwd,
    requireText(env.API_GATEWAY_STATE_FILE, "API_GATEWAY_STATE_FILE"),
  );
  const adminKey = optionalText(env.API_GATEWAY_ADMIN_KEY);

  return Object.freeze({
    host: optionalText(env.HOST) ?? "127.0.0.1",
    port: parsePort(env.PORT),
    stateFilePath,
    ...(adminKey ? { adminKey } : {}),
  });
}

export function createOperationalRuntime({
  env = process.env,
  cwd = process.cwd(),
  gatewayFactory = createOperationalGatewayWithReadonlyOperator,
} = {}) {
  if (typeof gatewayFactory !== "function") {
    throw new TypeError("gatewayFactory must be a function");
  }

  const config = resolveOperationalRuntimeConfig({ env, cwd });
  const gateway = gatewayFactory({
    stateFilePath: config.stateFilePath,
    ...(config.adminKey ? { adminKey: config.adminKey } : {}),
  });

  if (typeof gateway?.app?.handleRequest !== "function") {
    throw new TypeError("operational gateway app is unavailable");
  }

  return Object.freeze({
    mode: "operational",
    host: config.host,
    port: config.port,
    app: gateway.app,
    readiness: gateway.readiness,
    store: gateway.store,
    descriptor: Object.freeze({
      mode: "operational",
      stateStore: "json-file",
      adminKeyConfigured: Boolean(config.adminKey),
    }),
  });
}
