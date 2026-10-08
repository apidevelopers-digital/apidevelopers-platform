import { startServer } from "./server.mjs";
import { createHttpServerWithFamilyDataRead } from "./family-data-read-http-server.mjs";

function requireBinding(binding) {
  if (!binding || typeof binding.handleRequest !== "function" || typeof binding.status !== "function") {
    throw new TypeError("familyDataBinding with handleRequest/status is required when enabled");
  }
  return binding;
}

function normalizePort(port) {
  const value = Number(port ?? 3000);
  if (!Number.isInteger(value) || value < 0 || value > 65535) {
    throw new TypeError("port must be an integer between 0 and 65535");
  }
  return value;
}

export function planFamilyDataRuntimeStart({ enabled = false, familyDataBinding } = {}) {
  return Object.freeze({
    enabled,
    mode: enabled ? "explicit-family-data-runtime" : "canonical-runtime",
    requires_binding: enabled,
    binding_configured:
      Boolean(familyDataBinding) &&
      typeof familyDataBinding?.handleRequest === "function" &&
      typeof familyDataBinding?.status === "function",
    reads_env: false,
    changes_main: false,
    deploy_executed: false
  });
}

export async function startServerWithFamilyDataReadGate({
  enabled = false,
  familyDataBinding,
  port = 3000,
  host = "127.0.0.1",
  app,
  appOptions,
  maxBodyBytes,
  startBase = startServer,
  createRuntime = createHttpServerWithFamilyDataRead
} = {}) {
  if (!enabled) {
    return startBase({
      port: normalizePort(port),
      host,
      ...(app !== undefined ? { app } : {}),
      ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {})
    });
  }

  const binding = requireBinding(familyDataBinding);
  const runtime = createRuntime({
    ...(app !== undefined ? { app } : {}),
    ...(appOptions !== undefined ? { appOptions } : {}),
    familyDataBinding: binding,
    ...(maxBodyBytes !== undefined ? { maxBodyBytes } : {})
  });

  await new Promise((resolve, reject) => {
    runtime.server.once("error", reject);
    runtime.server.listen(normalizePort(port), host, resolve);
  });

  return runtime.server;
}
