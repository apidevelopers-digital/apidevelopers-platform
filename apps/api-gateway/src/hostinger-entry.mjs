import { readFileSync } from "node:fs";

import { registerOperationalShutdown } from "./operational-server.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { runUniCoPreviewBootstrap } from "./uni-co-preview-bootstrap.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";
import { createOperatorBootstrapHttpApp } from "./operator-bootstrap-http.mjs";
import { attachMitraPublicResearchToGateway } from "./mitra-public-operational-wrapper.mjs";
import { attachUniJuriProductionHandoffToGateway } from "./unijuri-production-handoff-operational-wrapper.mjs";
import { attachZuniChannelBindingWriteHostingerComposition } from "./zuni-channel-binding-write-hostinger-wiring.mjs";
import { attachTrustFaceAccessDurablePreviewToGateway } from "./trust-face-access-durable-runtime-transform.mjs";

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
  const mitraGateway = attachMitraPublicResearchToGateway({
    gateway: operatorGateway,
    env,
  });
  const uniJuriGateway = attachUniJuriProductionHandoffToGateway({
    gateway: mitraGateway,
    env,
  });
  return attachZuniChannelBindingWriteHostingerComposition({
    gateway: uniJuriGateway,
    env,
  });
}

function attachTrustAndHostingerCompositions(context = {}) {
  const trustGateway = attachTrustFaceAccessDurablePreviewToGateway(context);
  return attachHostingerCompositions({
    ...context,
    gateway: trustGateway,
  });
}

// Preserve the managed-hosting startup contract while routing the implementation
// through the Web Agent operational composition.
async function startOperationalGateway(options = {}) {
  return startWebAgentOperationalGateway(options);
}

const env = resolveHostingerRuntimeEnv(process.env, { readFileFn: readFileSync });
const { server, runtime } = await startOperationalGateway({
  env,
  gatewayTransform: attachTrustAndHostingerCompositions,
});
await runUniCoPreviewBootstrap({ app: runtime.app, env });

registerOperationalShutdown({ server });
