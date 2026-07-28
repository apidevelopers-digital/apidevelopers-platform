import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createApiKeyLifecycleService,
  createDurableApiKeyRepository,
} from "@apidevelopers/apikey-core";

import { createGatewayAuthenticator } from "./auth-composition.mjs";
import { createDurableGlobalTrustAuditSink } from "./durable-global-trust-audit.mjs";
import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createOperationalProtection } from "./operational-protection.mjs";
import { createApp } from "./server.mjs";

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

export function createOperationalGateway({
  stateFilePath,
  clock,
  writeIdFactory,
  apiKeyIdFactory,
  generateKey,
  assertTenantOperational,
  adminKey,
  adminPrincipal,
  resolveTenantId,
  protection,
  auditNow,
  auditIdFactory,
} = {}) {
  const store = createJsonFileStore({
    filePath: requireText(stateFilePath, "stateFilePath"),
    ...(clock ? { clock } : {}),
    ...(writeIdFactory ? { idFactory: writeIdFactory } : {}),
  });

  const apiKeyRepository = createDurableApiKeyRepository({ store });
  const apiKeyLifecycle = createApiKeyLifecycleService({
    repository: apiKeyRepository,
    ...(apiKeyIdFactory ? { idFactory: apiKeyIdFactory } : {}),
    ...(clock ? { clock } : {}),
    ...(generateKey ? { generateKey } : {}),
    ...(assertTenantOperational ? { assertTenantOperational } : {}),
  });

  const authenticator = createGatewayAuthenticator({
    apiKeyRepository,
    ...(adminKey ? { adminKey } : {}),
    ...(adminPrincipal ? { adminPrincipal } : {}),
    ...(resolveTenantId ? { resolveTenantId } : {}),
  });

  const auditSink = createDurableGlobalTrustAuditSink({ store });
  const audit = createGatewayGlobalTrustAudit({
    sink: auditSink,
    ...(auditNow ? { now: auditNow } : {}),
    ...(auditIdFactory ? { idFactory: auditIdFactory } : {}),
  });

  const baseApp = createApp({ authenticator, audit });
  const app = protection
    ? createOperationalProtection({
        app: baseApp,
        ...protection,
      })
    : baseApp;

  return Object.freeze({
    store,
    apiKeyRepository,
    apiKeyLifecycle,
    authenticator,
    audit,
    app,
    ...(protection ? { metrics: app.metrics } : {}),
  });
}
