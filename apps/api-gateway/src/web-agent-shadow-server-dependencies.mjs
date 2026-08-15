import { createSaaSAccessComposition } from "./saas-access-composition.mjs";

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
  clock,
} = {}) {
  if (!store || typeof store.read !== "function" || typeof store.transaction !== "function") {
    throw new TypeError("store must provide read and transaction");
  }

  requireFunction(resolveSessionByHash, "resolveSessionByHash");
  requireResolver(tenantInternationalProfile, "tenantInternationalProfile");
  requireResolver(commercialContext, "commercialContext");

  const { saasAccess } = createSaaSAccessComposition({
    store,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    resolveSessionByHash,
    saasAccess,
    tenantInternationalProfile,
    commercialContext,
  });
}
