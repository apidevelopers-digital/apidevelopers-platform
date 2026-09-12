import { createSaasAccessComposition } from "./saas-access-composition.mjs";
import { createDelegatedSaasAccessApp } from "./saas-delegated-access-v2.mjs";
import { createSaasProvisioningApp } from "./saas-provisioning.mjs";
import { createZuniPreviewProvisioningApp } from "./saas-zuni-preview-provisioning.mjs";
import { createZuniCommercialActivationPlanApp } from "./saas-zuni-commercial-activation-plan.mjs";
import { createZuniCommercialActivationDryRunApp } from "./saas-zuni-commercial-activation-dry-run.mjs";
import { createZuniCommercialActivationControlledWriteApp } from "./saas-zuni-commercial-activation-controlled-write.mjs";
import { createUniCoProvisioningApp } from "./saas-uni-co-provisioning.mjs";
import { createUniJuriAccessGrantWriter } from "./saas-unijuri-access-grant-writer.mjs";
import { createZuniProvisioningRuntimeGuard } from "./saas-zuni-provisioning-runtime-guard.mjs";
import { createZuniOperationalReadinessComposition } from "./saas-zuni-operational-readiness-composition.mjs";
import { createZuniPublicReadinessProbe } from "./saas-zuni-public-readiness-probe.mjs";
import { createApp } from "./server.mjs";
function pathnameOf(url) {
  return new URL(String(url ?? "/"), "http://api-gateway.local").pathname;
}

function envFlag(value, name) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized || normalized === "false") return false;
  if (normalized === "true") return true;
  throw new TypeError(`${name} must be true or false`);
}

function resolveZuniReadinessProbe({ probeZuniProductReadiness, zuniReadinessFetch } = {}) {
  if (typeof probeZuniProductReadiness === "function") return probeZuniProductReadiness;
  const fetchFn = zuniReadinessFetch ?? globalThis.fetch;
  if (typeof fetchFn !== "function") return undefined;
  return createZuniPublicReadinessProbe({ fetchFn });
}
export function createSaasOperationalHttpComposition({
  app, authenticator, audit, store, clock, delegatedBindingSigner,
  zuniProductProvisioner, probeZuniProductReadiness, zuniReadinessFetch,
  unijuriAccessWriteEnabled = envFlag(
    process.env.API_GATEWAY_UNIJURI_ACCESS_WRITE_ENABLED,
    "API_GATEWAY_UNIJURI_ACCESS_WRITE_ENABLED",
  ),
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
  const unijuriAccessGrantWriter = createUniJuriAccessGrantWriter({
    authenticator,
    runtime: saasComposition.saasRuntime,
    audit: typeof audit === "function" ? audit : async () => {},
    writeEnabled: unijuriAccessWriteEnabled,
  });
  const zuniCommercialActivationPlanApp = createZuniCommercialActivationPlanApp({ authenticator });
  const zuniCommercialActivationDryRunApp = createZuniCommercialActivationDryRunApp({ authenticator });
  const zuniCommercialActivationControlledWriteApp =
    createZuniCommercialActivationControlledWriteApp({
      authenticator,
      runtime: saasComposition.saasRuntime,
      audit: typeof audit === "function" ? audit : async () => {},
      writeEnabled: false,
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
    authenticator: authenticator,
    saasRuntime: guardedProvisioningRuntime,
    saasAccess: saasComposition.saasAccess,
    federatedPrincipal: saasComposition.federatedPrincipal,
    ...(clock ? { clock } : {}),
  });
  let zuniPreviewProvisioningApp = null;
  const getZuniPreviewProvisioningApp = () => {
    if (zuniPreviewProvisioningApp) return zuniPreviewProvisioningApp;
    zuniPreviewProvisioningApp = createZuniPreviewProvisioningApp({
      authenticator: authenticator,
      saasRuntime: guaredProvisioningRuntime,
      saasAccess: saasComposition.saasAccess,
      federatedPrincipal: saasComposition.federatedPrincipal,
      ...(clock ? { clock } : {}),
    });
    return zuniPreviewProvisioningApp;
  };
  const wrappedApp = Object.freeze({
    async handleRequest(request = {}) {
      const pathname = pathnameOf(request.url);
      if (pathname === "/v1/saas/uni-juri/access/provision") {
        if (String(request.method ?? "GET").toUpperCase() !== "POST") {
          return Object.freeze({
            status: 405,
            headers: Object.freeze({ allow: "POST", "content-type": "application/json; charset=utf-8" }),
            body: JSON.stringify({ ok: false, reason: "method_not_allowed" }),
          });
        }
        let body;
        try {
          body =
            request.body && typeof request.body === "object" && !Array.isArray(request.body)
              ? request.body
              : JSON.parse(String(request.body ?? ""));
        } catch {
          return Object.freeze({
            status: 400,
            headers: Object.freeze({ "content-type": "application/json; charset=utf-8" }),
            body: JSON.stringify({ ok: false, reason: "invalid_json" }),
          });
        }
        const result = await unijuriAccessGrantWriter.provision({
          headers: request.headers ?? {},
          approval: body.approval,
          binding: body.binding,
        });
        return Object.freeze({
          status: result.status,
          headers: Object.freeze({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }),
          body: JSON.stringify(result),
        });
      }
      if (pathname === "/v1/saas/uni-co/provision") {
        return uniCoProvisioningApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/zuni/activation/plan") {
        return zuniCommercialActivationPlanApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/zuni/activation/dry-run") {
        return zuniCommercialActivationDryRunApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/zuni/activation/write") {
        return zuniCommercialActivationControlledWriteApp.handleRequest(request);
      }
      if (pathname === "/v1/saas/zuni-preview/provision") {
        return getZuniPreviewProvisioningApp().handleRequest(request);
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
