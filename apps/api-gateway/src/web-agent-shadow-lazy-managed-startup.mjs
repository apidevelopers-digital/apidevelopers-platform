const SHADOW_ENABLED_ENV = "WEB_AGENT_SHADOW_ENABLED";

function isEnabled(value) {
  return typeof value === "string" && value.trim().toLowerCase() === "true";
}

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

export async function resolveWebAgentShadowLazyManagedStartup({
  env = process.env,
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch,
  loadManagedBootstrap = () => import("./web-agent-shadow-managed-bootstrap.mjs"),
  loadOperationalRuntime = () => import("./operational-runtime.mjs"),
} = {}) {
  if (!isEnabled(env?.[SHADOW_ENABLED_ENV])) {
    return Object.freeze({
      enabled: false,
      reason: "shadow_disabled",
      webAgentServerBootstrapOptions: undefined,
    });
  }

  requireFunction(loadManagedBootstrap, "loadManagedBootstrap");
  requireFunction(loadOperationalRuntime, "loadOperationalRuntime");

  const [managedModule, operationalModule] = await Promise.all([
    loadManagedBootstrap(),
    loadOperationalRuntime(),
  ]);

  const createManagedOptions = requireFunction(
    managedModule?.createWebAgentShadowManagedBootstrapOptions,
    "createWebAgentShadowManagedBootstrapOptions",
  );
  const createOperationalRuntime = requireFunction(
    operationalModule?.createOperationalRuntime,
    "createOperationalRuntime",
  );

  const operationalRuntime = createOperationalRuntime({ env, cwd });
  const webAgentServerBootstrapOptions = createManagedOptions({
    operationalRuntime,
    fetchImpl,
  });

  return Object.freeze({
    enabled: true,
    reason: "shadow_enabled",
    webAgentServerBootstrapOptions,
  });
}
