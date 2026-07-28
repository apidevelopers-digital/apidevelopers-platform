import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  createApiKeyLifecycleService,
  createDurableApiKeyRepository,
} from "@apidevelopers/apikey-core";

import { createGlobalTrustAuditQueryService } from "./audit-query.mjs";
import { createAuditQueryHttpApp } from "./audit-query-http.mjs";
import { createGatewayAuthenticator } from "./auth-composition.mjs";
import { createDurableGlobalTrustAuditSink } from "./durable-global-trust-audit.mjs";
import { createDurableGlobalTrustDecisionEvidence } from "./durable-global-trust-decision-evidence.mjs";
import { createGatewayGlobalTrustAudit } from "./global-trust-audit.mjs";
import { createGatewayAuthorizationService } from "./global-trust-authorization.mjs";
import { createGlobalTrustIntegrityHttpApp } from "./global-trust-integrity-http.mjs";
import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";
import { createGlobalTrustObservabilityHttpApp } from "./global-trust-observability-http.mjs";
import { createGlobalTrustObservabilityService } from "./global-trust-observability.mjs";
import { createGatewayRiskService } from "./global-trust-risk.mjs";
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
  riskNow,
  riskAssessmentIdFactory,
  safetyDecisionIdFactory,
  riskMethodVersion,
  decisionEvidenceNow,
  decisionEvidenceIdFactory,
  globalTrustObservabilityNow,
  integrityNow,
  integrityIdFactory,
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

  const integrity = createGlobalTrustIntegrityService({
    store,
    ...(integrityNow ? { now: integrityNow } : {}),
    ...(integrityIdFactory ? { idFactory: integrityIdFactory } : {}),
  });
  const auditSink = createDurableGlobalTrustAuditSink({ store, integrity });
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
  const risk = createGatewayRiskService({
    ...(riskNow ? { now: riskNow } : {}),
    ...(riskAssessmentIdFactory
      ? { assessmentIdFactory: riskAssessmentIdFactory }
      : {}),
    ...(safetyDecisionIdFactory
      ? { safetyDecisionIdFactory }
      : {}),
    ...(riskMethodVersion ? { methodVersion: riskMethodVersion } : {}),
  });
  const decisionEvidence = createDurableGlobalTrustDecisionEvidence({
    store,
    integrity,
    ...(decisionEvidenceNow ? { now: decisionEvidenceNow } : {}),
    ...(decisionEvidenceIdFactory ? { idFactory: decisionEvidenceIdFactory } : {}),
  });
  const globalTrustObservability = createGlobalTrustObservabilityService({
    store,
    ...(globalTrustObservabilityNow ? { now: globalTrustObservabilityNow } : {}),
  });

  const baseApp = createApp({ authenticator, audit });
  const queryApp = createAuditQueryHttpApp({
    app: baseApp,
    authenticator,
    authorization,
    risk,
    decisionEvidence,
    auditQuery,
  });
  const observabilityApp = createGlobalTrustObservabilityHttpApp({
    app: queryApp,
    authenticator,
    authorization,
    observability: globalTrustObservability,
  });
  const integrityApp = createGlobalTrustIntegrityHttpApp({
    app: observabilityApp,
    authenticator,
    authorization,
    integrity,
  });
  const app = protection
    ? createOperationalProtection({ app: integrityApp, ...protection })
    : integrityApp;

  return Object.freeze({
    store,
    apiKeyRepository,
    apiKeyLifecycle,
    authenticator,
    audit,
    auditQuery,
    authorization,
    risk,
    decisionEvidence,
    globalTrustObservability,
    integrity,
    app,
    ...(protection ? { metrics: app.metrics } : {}),
  });
}
