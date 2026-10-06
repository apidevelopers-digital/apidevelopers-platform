import { createRetrievalRuntime } from "./retrieval-runtime.mjs";

function parseBooleanFlag(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  const error = new TypeError(`${name} must be true or false`);
  error.code = "RETRIEVAL_OPERATIONAL_INVALID_FLAG";
  throw error;
}

function requireGateway(gateway) {
  if (!gateway || typeof gateway !== "object") {
    const error = new TypeError("gateway is required");
    error.code = "RETRIEVAL_OPERATIONAL_GATEWAY_REQUIRED";
    throw error;
  }
  if (typeof gateway.app?.handleRequest !== "function") {
    const error = new TypeError("gateway.app.handleRequest must be a function");
    error.code = "RETRIEVAL_OPERATIONAL_GATEWAY_REQUIRED";
    throw error;
  }
  return gateway;
}

function normalizeRuntimeDescriptor(runtime, enabled) {
  const connectorIds = Array.isArray(runtime?.connectorIds)
    ? [...runtime.connectorIds]
    : [];
  const resolverIds = Array.isArray(runtime?.resolverIds)
    ? [...runtime.resolverIds]
    : [];

  return Object.freeze({
    enabled,
    status:
      typeof runtime?.status === "string"
        ? runtime.status
        : enabled
          ? "unknown"
          : "disabled",
    featureFlag: "RETRIEVAL_ENABLED",
    connectorIds: Object.freeze(connectorIds),
    resolverIds: Object.freeze(resolverIds),
  });
}

export function resolveRetrievalOperationalEnabled(env = process.env) {
  return parseBooleanFlag(env.RETRIEVAL_ENABLED, "RETRIEVAL_ENABLED");
}

export function attachRetrievalOperationalRuntimeToGateway({
  gateway: gatewayInput,
  env = process.env,
  runtimeFactory = createRetrievalRuntime,
  resolveRuntimeOptions,
} = {}) {
  const gateway = requireGateway(gatewayInput);
  if (typeof runtimeFactory !== "function") {
    const error = new TypeError("runtimeFactory must be a function");
    error.code = "RETRIEVAL_OPERATIONAL_DEPENDENCY_REQUIRED";
    throw error;
  }

  const enabled = resolveRetrievalOperationalEnabled(env);

  if (!enabled) {
    const runtime = runtimeFactory({ enabled: false });
    if (!runtime || runtime.enabled !== false || runtime.status !== "disabled") {
      const error = new TypeError(
        "disabled retrieval runtime must resolve with enabled=false and status=disabled",
      );
      error.code = "RETRIEVAL_OPERATIONAL_DISABLED_RUNTIME_INVALID";
      throw error;
    }

    return Object.freeze({
      ...gateway,
      retrievalRuntime: runtime,
      retrievalOperational: normalizeRuntimeDescriptor(runtime, false),
    });
  }

  if (typeof resolveRuntimeOptions !== "function") {
    const error = new Error(
      "RETRIEVAL_ENABLED=true requires explicit governed runtime options",
    );
    error.code = "RETRIEVAL_OPERATIONAL_WIRING_REQUIRED";
    throw error;
  }

  const resolvedOptions = resolveRuntimeOptions({ gateway, env });
  if (
    !resolvedOptions ||
    typeof resolvedOptions !== "object" ||
    typeof resolvedOptions.then === "function"
  ) {
    const error = new TypeError(
      "resolveRuntimeOptions must synchronously return a runtime options object",
    );
    error.code = "RETRIEVAL_OPERATIONAL_OPTIONS_INVALID";
    throw error;
  }

  const runtime = runtimeFactory({
    ...resolvedOptions,
    enabled: true,
  });

  if (!runtime || runtime.enabled !== true || runtime.status !== "ready") {
    const error = new Error("enabled retrieval runtime is not ready");
    error.code = "RETRIEVAL_OPERATIONAL_RUNTIME_NOT_READY";
    throw error;
  }

  const connectorIds = Array.isArray(runtime.connectorIds)
    ? runtime.connectorIds
    : [];
  if (connectorIds.length === 0) {
    const error = new Error(
      "enabled retrieval runtime requires at least one governed connector",
    );
    error.code = "RETRIEVAL_OPERATIONAL_PROVIDER_REQUIRED";
    throw error;
  }

  return Object.freeze({
    ...gateway,
    retrievalRuntime: runtime,
    retrievalOperational: normalizeRuntimeDescriptor(runtime, true),
  });
}
