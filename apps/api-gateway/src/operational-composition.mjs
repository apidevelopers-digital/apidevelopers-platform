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
import { createGlobalTrustHumanApprovalHttpApp } from "./global-trust-human-approval-http.mjs";
import { createGlobalTrustHumanApprovalService } from "./global-trust-human-approval.mjs";
import { createGlobalTrustIntegrityBackfillHttpApp } from "./global-trust-integrity-backfill-http.mjs";
import { createGlobalTrustIntegrityBackfillService } from "./global-trust-integrity-backfill.mjs";
import { createGlobalTrustIntegrityHttpApp } from "./global-trust-integrity-http.mjs";
import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";
import { createGlobalTrustKillSwitchHttpApp } from "./global-trust-kill-switch-http.mjs";
import { createGlobalTrustKillSwitchService } from "./global-trust-kill-switch.mjs";
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
  integrityBackfillNow,
  humanApprovalNow,
  humanApprovalRequestIdFactory,
  humanApprovalResolutionIdFactory,
  humanApprovalConsumptionIdFactory,
  humanApprovalTtlMs,
  killSwitchNow,
  killSwitchEventIdFactory,
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

  const humanApproval = createGlobalTrustHumanApprovalService({
    store,
    integrity,
    ...(humanApprovalNow ? { now: humanApprovalNow } : {}),
    ...(humanApprovalRequestIdFactory
      ? { requestIdFactory: humanApprovalRequestIdFactory }
      : {}),
    ...(humanApprovalResolutionIdFactory
      ? { resolutionIdFactory: humanApprovalResolutionIdFactory }
      : {}),
    ...(humanApprovalConsumptionIdFactory
      ? { consumptionIdFactory: humanApprovalConsumptionIdFactory }
      : {}),
    ...(humanApprovalTtlMs ? { ttlMs: humanApprovalTtlMs } : {}),
  });

  const killSwitch = createGlobalTrustKillSwitchService({
    store,
    integrity,
    ...(killSwitchNow ? { now: killSwitchNow } : {}),
    ...(killSwitchEventIdFactory
      ? { eventIdFactory: killSwitchEventIdFactory }
      : {}),
  });

  const decisionEvidence = createDurableGlobalTrustDecisionEvidence({
    store,
    integrity,
    ...(decisionEvidenceNow ? { now: decisionEvidenceNow } : {}),
    ...(decisionEvidenceIdFactory
      ? { idFactory: decisionEvidenceIdFactory }
      : {}),
  });

  const globalTrustObservability = createGlobalTrustObservabilityService({
    store,
    ...(globalTrustObservabilityNow ? { now: globalTrustObservabilityNow } : {}),
  });

  const integrityBackfill = createGlobalTrustIntegrityBackfillService({
    store,
    integrity,
    ...(integrityBackfillNow ? { now: integrityBackfillNow } : {}),
  });

  const baseApp = createApp({ authenticator, audit });
  const queryApp = createAuditQueryHttpApp({
    app: baseApp,
    authenticator,
    authorization,
    risk,
    decisionEvidence,
    humanApproval,
    killSwitch,
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
  const integrityBackfillApp = createGlobalTrustIntegrityBackfillHttpApp ({
    app: integrityApp,
    authenticator,
    authorization,
    backfill: integrityBackfill,
  });
  const humanApprovalApp = createGlobalTrustHumanApprovalHttpApp ({
    app: integrityBackfillApp,
    authenticator,
    authorization,
    humanApproval,
  });
  const killSwitchApp = createGlobalTrustKillSwitchHttpApp ({
    app: humanApprovalApp,
    authenticator,
    authorization,
    killSwitch,
  });
  const app = protection
    ? createOperationalProtection({ app: killSwitchApp, ...protection })
    : killSwitchApp;

  return Object.freeze({
    store,
    apiKeyRepository,
    apiKeyLifecycle,
    authenticator,
    audit,
    auditQuery,
    authorization,
    risk,
    humanApproval,
    killSwitch,
    decisionEvidence,
    globalTrustObservability,
    integrity,
    integrityBackfill,
    app,
    ...(protection ? { metrics: app.metrics } : {}),
  });
}
