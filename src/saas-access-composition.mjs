import {
  createSaasRuntime,
  createAccessRuntime,
  createFederatedPrincipalRuntime,
} from "@apidevelopers/saas-runtime";

export function createSaasAccessComposition({
  store,
  clock,
} = {}) {
  if (!store || typeof store.read !== "function") {
    throw new TypeError("store is required");
  }

  const saasRuntime = createSaasRuntime({
    store,
    ...(clock ? { clock } : {}),
  });
  const saasAccess = createAccessRuntime({
    store,
    saasRuntime,
    ...(clock ? { clock } : {}),
  });
  const federatedPrincipal = createFederatedPrincipalRuntime({
    store,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    saasRuntime,
    saasAccess,
    federatedPrincipal,
  });
}
