import { createFixedWindowRateLimiter } from "./operational-protection.mjs";
import {
  createOperationalReadinessService,
  createReadinessHttpApp,
} from "./operational-readiness-composition.mjs";
import {
  createOperationalGatewayWithHostingerStructure,
} from "./operator-hostinger-structure-composition.mjs";
import {
  createOperatorReadonlyCore,
  createUnavailableOperatorReadonlyAdapters,
} from "./operator-readonly-core.mjs";
import { createOperatorReadonlyHttpApp } from "./operator-readonly-http.mjs";
import { createGitHubReadonlyAdapters } from "./operator-github-readonly-adapter.mjs";
import { createSaasOperationalHttpComposition } from "./saas-operational-http-composition.mjs";
import { createTrustSandboxProvisioningApp } from "./saas-trust-sandbox-provisioning.mjs";
import { createTrustSandboxVerificationApp } from "./trust-sandbox-verifications.mjs";

export function createOperationalGatewayWithReadonlyOperator({
  operatorReadonlyAdapters,
  operatorReadonlyNow,
  operatorReadonlyMaxBodyBytes,
  operatorReadonlyRateLimiter,
  githubReadonlyClient,
  githubReadonlyOrganization,
  githubReadonlyNow,
  readinessChecks = [],
  readinessNow,
  ...operationalOptions
} = {}) {
  const sharedRateLimiter =
    operatorReadonlyRateLimiter ??
    operationalOptions.protection?.rateLimiter ??
    createFixedWindowRateLimiter();
  const protection = operationalOptions.protection
    ? Object.freeze({
        ...operationalOptions.protection,
        rateLimiter:
          operationalOptions.protection.rateLimiter ?? sharedRateLimiter,
      })
    : Object.freeze({ rateLimiter: sharedRateLimiter });

  const base = createOperationalGatewayWithHostingerStructure({
    ...operationalOptions,
    protection,
  });

  const saasComposition = createSaasOperationalHttpComposition({
    app: base.app,
    authenticator: base.authenticator,
    audit: base.audit,
    store: base.store,
    ...(operationalOptions.clock ? { clock: operationalOptions.clock } : {}),
    ...(operationalOptions.delegatedBindingSigner
      ? { delegatedBindingSigner: operationalOptions.delegatedBindingSigner }
      : {}),
    ...(operationalOptions.probeZuniProductReadiness
      ? { probeZuniProductReadiness: operationalOptions.probeZuniProductReadiness }
      : {}),
    ...(operationalOptions.zuniReadinessFetch
      ? { zuniReadinessFetch: operationalOptions.zuniReadinessFetch }
      : {}),
  });

  const trustSandboxProvisioningApp = createTrustSandboxProvisioningApp({
    authenticator: base.authenticator,
    saasRuntime: saasComposition.saasRuntime,
    apiKeyLifecycle: base.apiKeyLifecycle,
    ...(operationalOptions.clock ? { clock: operationalOptions.clock } : {}),
  });

  const trustSandboxVerificationApp = createTrustSandboxVerificationApp({
    authenticator: base.authenticator,
    store: base.store,
    ...(operationalOptions.clock ? { clock: operationalOptions.clock } : {}),
    ...(operationalOptions.trustVerificationIdFactory
      ? { idFactory: operationalOptions.trustVerificationIdFactory }
      : {}),
  });

  const saasAndTrustApp = Object.freeze({
    async handleRequest(request = {}) {
      const verificationResponse =
        await trustSandboxVerificationApp.handleRequest(request);
      if (verificationResponse !== null) return verificationResponse;

      const provisioningResponse =
        await trustSandboxProvisioningApp.handleRequest(request);
      if (provisioningResponse !== null) return provisioningResponse;

      return saasComposition.app.handleRequest(request);
    },
  });

  const adapters =
    operatorReadonlyAdapters ??
    (githubReadonlyClient
      ? createGitHubReadonlyAdapters({
          client: githubReadonlyClient,
          organization: githubReadonlyOrganization,
          ...(githubReadonlyNow ? { now: githubReadonlyNow } : {}),
        })
      : createUnavailableOperatorReadonlyAdapters());

  const operatorReadonlyCore = createOperatorReadonlyCore({
    adapters,
    auditRecorder: base.audit,
    ...(operatorReadonlyNow ? { now: operatorReadonlyNow } : {}),
  });

  const readonlyApp = createOperatorReadonlyHttpApp({
    app: saasAndTrustApp,
    authenticator: base.authenticator,
    authorization: base.authorization,
    core: operatorReadonlyCore,
    audit: base.audit,
    rateLimiter: sharedRateLimiter,
    ...(operatorReadonlyMaxBodyBytes
      ? { maxBodyBytes: operatorReadonlyMaxBodyBytes }
      : {}),
  });

  const readiness = createOperationalReadinessService({
    store: base.store,
    checks: readinessChecks,
    ...(readinessNow ? { now: readinessNow } : {}),
  });

  const app = createReadinessHttpApp({
    app: readonlyApp,
    readiness,
  });

  return Object.freeze({
    ...base,
    saasRuntime: saasComposition.saasRuntime,
    saasAccess: saasComposition.saasAccess,
    trustSandboxProvisioningApp,
    trustSandboxVerificationApp,
    operatorReadonlyAdapters: adapters,
    operatorReadonlyCore,
    operatorReadonlyRateLimiter: sharedRateLimiter,
    readiness,
    app,
  });
}
