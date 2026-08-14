import { createSaaSRuntime } from "@apidevelopers/saas-runtime";

import { createGlobalTrustEvaluationHttpHandler } from "./global-trust-evaluation-http.mjs";
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

export function createOperationalTrustEvaluationGateway(options = {}) {
  const gateway = createOperationalGateway(options);
  const saasRuntime = createSaaSRuntime({
    store: gateway.store,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const evaluationTenantService = createGlobalTrustEvaluationTenantService({
    store: gateway.store,
    saasRuntime,
    apiKeyLifecycle: gateway.apiKeyLifecycle,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  const evaluationHttp = createGlobalTrustEvaluationHttpHandler({
    authenticator: gateway.authenticator,
    evaluationTenantService,
  });
  const app = wrapEvaluationApp({
    app: gateway.app,
    evaluationHttp,
  });

  return Object.freeze({
    ...gateway,
    saasRuntime,
    evaluationTenantService,
    evaluationHttp,
    app,
  });
}
