import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createApiKeyLifecycleService,
  createDurableApiKeyRepository,
} from "@apidevelopers/apikey-core";

import { createGlobalTrustAuditQueryService } from "./audit-query.mjs";
import { createAuditQueryHttpApp } from "./audit-query-http.mjs";
import { createGatewayAuthenticator } from "./auth-composition.mjs";
import { createDurableGlobalTrustAuditSink } from "./durable-global-trust-audit.mjs";
import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createGatewayAuthorizationService } from "./global-trust-authorization.mjs";
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
  authorizationNow,
  authorizationIdFactory,
  authorizationPolicyVersion,
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
  const auditQuery = createGlobalTrustAuditQueryService({ store });
  const authorization = createGatewayAuthorizationService({
    ...(authorizationNow ? { now: authorizationNow } : {}),
    ...(authorizationIdFactory ? { idFactory: authorizationIdFactory } : {}),
    ...(authorizationPolicyVersion ? { policyVersion: authorizationPolicyVersion } : {}),
  });

  const baseApp = createApp({ authenticator, audit });
  const queryApp = createAuditQueryHttpApp({
    app: baseApp,
    authenticator,
    authorization,
    auditQuery,
  });
  const app = protection
    ? createOperationalProtection({
        app: queryApp,
        ...protection,
      })
    : queryApp;

  return Object.freeze({
    store,
    apiKeyRepository,
    apiKeyLifecycle,
    authenticator,
    audit,
    auditQuery,
    authorization,
    app,
    ...(protection ? { metrics: app.metrics } : {}),
  });
}
