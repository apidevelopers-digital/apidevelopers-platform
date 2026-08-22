import {
  createSaasRuntime,
  createAccessRuntime,
  createFederatedPrincipalRuntime,
  createMembershipRuntime,
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
  const accessRuntime = createAccessRuntime({
    store,
    saasRuntime,
    ...(clock ? { clock } : {}),
  });
  const membershipRuntime = createMembershipRuntime({
    store,
    saasRuntime,
    accessRuntime,
    ...(clock ? { clock } : {}),
  });
  const saasAccess = Object.freeze({
    ...accessRuntime,
    saasRuntime,
    membershipRuntime,
  });
  const federatedPrincipal = createFederatedPrincipalRuntime({
    store,
    ...(clock ? { clock } : {}),
  });

  return Object.freeze({
    saasRuntime,
    saasAccess,
    membershipRuntime,
    federatedPrincipal,
  });
}
