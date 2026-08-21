import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createDelegatedSaasAccessApp } from "./saas-delegated-access-v2.mjs";
import { createSaasProvisioningApp } from "./saas-provisioning.mjs";
import { createZuniPreviewProvisioningApp } from "./saas-zuni-preview-provisioning.mjs";
import { createUniCoProvisioningApp } from "./saas-uni-co-provisioning.mjs";
import { createZuniProvisioningRuntimeGuard } from "./saas-zuni-provisioning-runtime-guard.mjs";
import { createZuniOperationalReadinessComposition } from "./saas-zuni-operational-readiness-composition.mjs";
import { createZuniPublicReadinessProbe } from "./saas-zuni-public-readiness-probe.mjs";
import { createApp } from "./server.mjs";

function pathnameOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
}

function resolveZuniReadinessProbe({ probeZuniProductReadiness, zuniReadinessFetch } = {}) {
  if (typeof probeZuniProductReadiness === "function") return probeZuniProductReadiness;
  const fetchFn = zuniReadinessFetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return undefined;
  return createZuniPublicReadinessProbe({ fetchFn });
}

export function createSaasOperationalHttpComposition( {
  app, authenticator, audit, store, clock, delegatedBindingSigner,
 zuniProductProvisioner, probeZuniProductReadiness, zuniReadinessFetch,
} = {}) {
  if (typeof app?.handleRequest !== "function") throw new TypeError("app.handleRequest must be a function");
  if (typeof authenticator?.authenticate !== "function") throw new TypeError("authenticator.authenticate must be a function");
  if (!store || typeof store.read !== "function") throw new TypeError("store is required");

  const saasComposition = createSaasAccessComposition({ store, ...(clock ? { clock } : {}) });
  const saasApp = createApp({ authenticator, audit, saasAccess: saasComposition.saasAccess });
  const delegatedApp = createDelegatedSaasAccessApp({
    authenticator,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(delegatedBindingSigner ? { bindingSigner: delegatedBindingSigner } : {}),
  });
  const uniCoProvisioningApp = createUniCoProvisioningApp({
    authenticator,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(clock ? { clock } : {}),
  });

  const concreteProbe = resolveZuniReadinessProbe({ probeZuniProductReadiness, zuniReadinessFetch });
  const readinessProvisioner =
    zuniProductProvisioner ??
    (typeof concreteProbe === "function"
      ? createZuniOperationalReadinessComposition({
          saasRuntime: saasComposition.saasRuntime,
          probeZuniProductReadiness: concreteProbe,
        }).adapter
      : undefined);

  const guardedProvisioningRuntime = createZuniProvisioningRuntimeGuard({
    saasRuntime: saasComposition.saasRuntime,
    ...(readinessProvisioner ? { zuniProductProvisioner: readinessProvisioner } : {}),
  });
  const provisioningApp = createSaasProvisioningApp({
    authenticator,
    saasRuntime: guardedProvisioningRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(clock ? { clock } : {}),
  });
  const zuniPreviewProvisioningApp = createZuniPreviewProvisioningApp({
    authenticator,
    saasRuntime: guardedProvisioningRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(clock ? { clock } : {}),
  });

  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      const pathname = pathnameOf(request.url);
      if (pathname === "/v1/saas/uni-co/provision") {
        return uniCoProvisioningApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/zuni-preview/provision") {
        return zuniPreviewProvisioningApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/provision") return provisioningApp.handleRequest(request);
      if (pathname === "/v1/saas/access/delegated") return delegatedApp.handleRequest(request);
      if (pathname === "/v1/saas/access") return saasApp.handleRequest(request);
      return app.handleRequest(request);
    },
  });

  return Object.freeze({
    app: wrappedApp,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
  });
}
