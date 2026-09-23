import { readFileSync } from "node:fs";

import { startOperationalHttpServer } from "./operational-http-transport.mjs";
import { registerOperationalShutdown } from "./operational-server-runtime.mjs";
import { resolveHostingerRuntimeEnv } from "./hostinger-runtime-env.mjs";
import { runUniCoPreviewBootstrap } from "./uni-co-preview-bootstrap.mjs";
import { startWebAgentOperationalGateway } from "./web-agent-operational-startup.mjs";
import { createOperatorBootstrapHttpApp } from "./operator-bootstrap-http.mjs";
import { createOperatorSecretHandoffOperationalComposition } from "./operator-secret-handoff-operational-composition.mjs";
import { createOperatorHostingerMysqlStagingHandoffHttpApp } from "./operator-hostinger-mysql-staging-handoff-http.mjs";
import { attachMitraPublicResearchToGateway } from "./mitra-public-operational-wrapper.mjs";
import { attachUniJuriProductionHandoffToGateway } from "./unijuri-production-handoff-operational-wrapper.mjs";
import { attachZuniChannelBindingWriteHostingerComposition } from "./zuni-channel-binding-write-hostinger-wiring.mjs";
import { attachTrustFaceAccessDurablePreviewToGateway } from "./trust-face-access-durable-runtime-transform.mjs";
import { createOperatorApiKeyProvisioningRuntimeApp } from "./operator-api-key-provisioning-composition.mjs";
import { createOperatorApiKeyProvisioningWrapper } from "./operator-api-key-provisioning-wrapper.mjs";

function configured(value) {
  return Boolean(String(value ?? "").trim());
}

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

let secretHandoffHttpApp;

function attachOperatorSecretHandoff({ gateway, env }) {
  const composition = createOperatorSecretHandoffOperationalComposition({
    app: gateway.app,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    runtimeDescriptor: Object.freeze({
      adminKeyConfigured: configured(env.API_GATEWAY_ADMIN_KEY),
    }),
    env,
  });

  if (!composition.enabled) {
    secretHandoffHttpApp = undefined;
    return Object.freeze({ ...gateway });
  }

  secretHandoffHttpApp = composition.httpApp;

  const app = createOperatorHostingerMysqlStagingHandoffHttpApp({
    app: composition.httpApp,
    authenticator: gateway.authenticator,
    authorization: gateway.authorization,
    handoffService: composition.handoffService,
    secretProvider: composition.secretProvider,
    env,
  });

  return Object.freeze({
    ...gateway,
    app,
    secretHandoff: Object.freeze({
      enabled: true,
      descriptor: composition.descriptor,
    }),
  });
}

function attachOperatorApiKeyProvisioning({ gateway }) {
  const operatorApiKeyProvisioningApp =
    createOperatorApiKeyProvisioningRuntimeApp({
      authenticator: gateway.authenticator,
      apiKeyLifecycle: gateway.apiKeyLifecycle,
    });

  const app = createOperatorApiKeyProvisioningWrapper({
    app: gateway.app,
    operatorApiKeyProvisioningApp,
  });

  return Object.freeze({
    ...gateway,
    operatorApiKeyProvisioningApp,
    app,
  });
}

function attachHostingerCompositions({ gateway, env }) {
  const operatorGateway = attachOperatorBootstrap({ gateway });
  const secretHandoffGateway = attachOperatorSecretHandoff({
    gateway: operatorGateway,
    env,
  });
  const keyProvisionerGateway = attachOperatorApiKeyProvisioning({
    gateway: secretHandoffGateway,
  });
  const mitraGateway = attachMitraPublicResearchToGateway({
    gateway: keyProvisionerGateway,
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

async function startOperationalGateway(options = {}) {
  secretHandoffHttpApp = undefined;

  return startWebAgentOperationalGateway({
    ...options,
    serverFactory(serverOptions = {}) {
      return startOperationalHttpServer({
        ...serverOptions,
        ...(secretHandoffHttpApp ? { secretHandoffHttpApp } : {}),
      });
    },
  });
}

const env = resolveHostingerRuntimeEnv(process.env, { readFileFn: readFileSync });
const { server, runtime } = await startOperationalGateway({
  env,
  gatewayTransform: attachTrustAndHostingerCompositions,
});

await runUniCoPreviewBootstrap({ app: runtime.app, env });

registerOperationalShutdown({ server });
