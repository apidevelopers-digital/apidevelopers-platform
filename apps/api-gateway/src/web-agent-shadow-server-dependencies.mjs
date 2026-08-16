import { createSaasAccessComposition } from "./saas-access-composition.mjs";

function requireFunction(value, name) {
  if (typeof value !== "function") {
    throw new TypeError(`${name} must be a function`);
  }
  return value;
}

function requireResolver(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${name} must be an object`);
  }
  requireFunction(value.resolve, `${name}.resolve`);
  return value;
}

export function createWebAgentShadowServerDependencies({
  store,
  resolveSessionByHash,
  tenantInternationalProfile,
  commercialContext,
  memoryProvider,
  clock,
} = {}) {
  if (
    !store ||
    typeof store.read !== "function" ||
    typeof store.transaction !== "function" ||
    typeof store.executeIdempotent !== "function"
  ) {
    throw new TypeError(
      "store must provide read, transaction and executeIdempotent",
    );
  }

  requireFunction(resolveSessionByHash, "resolveSessionByHash");
  requireResolver(tenantInternationalProfile, "tenantInternationalProfile");
  requireResolver(commercialContext, "commercialContext");
  if (memoryProvider !== undefined) {
    if (!memoryProvider || typeof memoryProvider !== "object" || Array.isArray(memoryProvider)) {
      throw new TypeError("memoryProvider must be an object");
    }
    requireFunction(memoryProvider.recall, "memoryProvider.recall");
  }

  const { saasAccess } = createSaasAccessComposition({
    store,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    resolveSessionByHash,
    saasAccess,
    tenantInternationalProfile,
    commercialContext,
    ...(memoryProvider ? { memoryProvider } : {}),
  });
}
