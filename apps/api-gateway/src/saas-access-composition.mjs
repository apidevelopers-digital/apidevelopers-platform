import {
  createSaasRuntime,
  createAccessRuntime,
} from "../../../packages/saas-runtime/src/index.mjs";

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

  return Object.freeze({
    saasRuntime,
    saasAccess,
  });
}
