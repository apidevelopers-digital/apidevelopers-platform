import { createGatewayService } from "../src/index.mjs";

export const T0 = "2026-07-21T00:00:00.000Z";

export function principal(patch = {}) {
  return {
    apiKeyId: "apikey-1",
    apiKeyPrefix: "apid_live_abc",
    apiKeyStatus: "active",
    tenantId: "tenant-1",
    projectId: "project-1",
    subscriptionId: "subscription-1",
    ...patch,
  };
}

export function fixture({ entitlementError = null, limitAllowed = true, usageError = null } = {}) {
  let id = 0;
  let usageCalls = 0;
  const entitlementCalls = [];
  const limitCalls = [];
  const usageCallsList = [];
  const entitlementService = {
    assertAccess(input) {
      entitlementCalls.push(input);
      if (entitlementError) throw entitlementError;
      return {
        allowed: true,
        snapshot: { id: "entitlement-snapshot-1", planId: "plan-1" },
        entitlement: null,
      };
    },
  };
  const limitsService = {
    evaluate(input) {
      limitCalls.push(input);
      return {
        assignment: { id: "assignment-1", planId: "plan-1" },
        rule: { id: "limit-rule-1" },
        window: { from: T0, to: "2026-08-01T00:00:00.000Z" },
        decision: {
          allowed: limitAllowed,
          action: limitAllowed ? "allow" : "block",
        },
      };
    },
  };
  const usageService = {
    recordUsage(input) {
      usageCalls += 1;
      usageCallsList.push(input);
      if (usageError) throw usageError;
      return { event: { id: `usage-${usageCalls}` }, appended: true };
    },
  };
  const service = createGatewayService({
    entitlementService,
    limitsService,
    usageService,
    idFactory: () => `snapshot-${++id}`,
    clock: () => T0,
  });
  return {
    service,
    entitlementCalls,
    limitCalls,
    usageCallsList,
    usageCount: () => usageCalls,
  };
}

export function authorize(service, patch = {}) {
  return service.authorize({
    requestId: "request-1",
    idempotencyKey: "gateway-request-1",
    principal: principal(),
    apiId: "payments",
    operation: "charges.create",
    entitlementKey: "payments.write",
    quantity: 1,
    requestedAt: T0,
    metadata: { traceId: "trace-1" },
    ...patch,
  });
}
