import { createSaasRuntime } from "@apidevelopers/saas-runtime";

import { createGlobalTrustEvaluationHttpHandler } from "./global-trust-evaluation-http.mjs";
import { createGlobalTrustEvaluationOperatorProvisioningService } from "./global-trust-evaluation-operator-provisioning.mjs";
import { createGlobalTrustEvaluationTenantService } from "./global-trust-evaluation-tenant.mjs";
import { createOperationalGateway } from "./operational-composition.mjs";

function wrapEvaluationApp({ app, evaluationHttp }) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof evaluationHttp?.handleRequest !== "function") {
    throw new TypeError("evaluationHttp.handleRequest must be a function");
  }

  return Object.freeze({
    async handleRequest(request = {}) {
      const routed = await evaluationHttp.handleRequest(request);
      if (routed !== null) return routed;
      return app.handleRequest(request);
    },
    ...(app.metrics ? { metrics: app.metrics } : {}),
  });
}

function assertGateway(gateway) {
  if (!gateway || typeof gateway !== "object") {
    throw new TypeError("gateway is required");
  }
  if (
    !gateway.store
    || typeof gateway.store.read !== "function"
    || typeof gateway.store.transaction !== "function"
  ) {
    throw new TypeError("gateway.store must provide read and transaction");
  }
  if (
    !gateway.apiKeyLifecycle
    || typeof gateway.apiKeyLifecycle.issueApiKey !== "function"
  ) {
    throw new TypeError("gateway.apiKeyLifecycle is unavailable");
  }
  if (
    !gateway.authenticator
    || typeof gateway.authenticator.authenticate !== "function"
  ) {
    throw new TypeError("gateway.authenticator is unavailable");
  }
  return gateway;
}

export function attachOperationalTrustEvaluationGateway({
  gateway: gatewayInput,
  clock,
  credentialHandoff,
} = {}) {
  const gateway = assertGateway(gatewayInput);

  const saasRuntime = createSaasRuntime({
    store: gateway.store,
    ...(clock ? { clock } : {}),
  });
  const evaluationTenantService = createGlobalTrustEvaluationTenantService({
    store: gateway.store,
    saasRuntime,
    apiKeyLifecycle: gateway.apiKeyLifecycle,
    ...(clock ? { clock } : {}),
  });
  const evaluationHttp = createGlobalTrustEvaluationHttpHandler({
    authenticator: gateway.authenticator,
    evaluationTenantService,
  });
  const app = wrapEvaluationApp({
    app: gateway.app,
    evaluationHttp,
  });

  const evaluationOperatorProvisioning = credentialHandoff
    ? createGlobalTrustEvaluationOperatorProvisioningService({
        evaluationTenantService,
        audit: gateway.audit,
        credentialHandoff,
      })
    : null;

  return Object.freeze({
    ...gateway,
    saasRuntime,
    evaluationTenantService,
    evaluationHttp,
    ...(evaluationOperatorProvisioning ? { evaluationOperatorProvisioning } : {}),
    app,
  });
}

export function createOperationalTrustEvaluationGateway(options = {}) {
  const gateway = createOperationalGateway(options);
  return attachOperationalTrustEvaluationGateway({
    gateway,
    ...(options.clock ? { clock: options.clock } : {}),
    ...(options.credentialHandoff ? { credentialHandoff: options.credentialHandoff } : {}),
  });
}
