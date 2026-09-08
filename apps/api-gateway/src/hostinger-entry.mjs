import { registerOperationalShutdown } from "./operational-server.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { runUniCoPreviewBootstrap } from "./uni-co-preview-bootstrap.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";
import { createOperatorBootstrapHttpApp } from "./operator-bootstrap-http.mjs";
import { attachMitraPublicResearchToGateway } from "./mitra-public-operational-wrapper.mjs";

function attachOperatorBootstrap({ gateway }) {
  const app = createOperatorBootstrapHttpApp({
    app: gateway.app,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    apiKeyRepository: gateway.apiKeyRepository,
    audit: gateway.audit,
  });
  return Object.freeze({ ...gateway, app });
}

function attachHostingerCompositions({ gateway, env }) {
  const operatorGateway = attachOperatorBootstrap({ gateway });
  return attachMitraPublicResearchToGateway({
    gateway: operatorGateway,
    env,
  });
}

// Preserve the managed-hosting startup contract while routing the implementation
// through the Web Agent operational composition.
async function startOperationalGateway(options = {}) {
  return startWebAgentOperationalGateway(options);
}

const env = resolveHostingerRuntimeEnv(process.env);
const { server, runtime } = await startOperationalGateway({
  env,
  gatewayTransform: attachHostingerCompositions,
});
await runUniCoPreviewBootstrap({ app: runtime.app, env });

registerOperationalShutdown({ server });
