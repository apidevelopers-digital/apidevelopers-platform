import { randomUUID } from "node:crypto";

import { createAuditEvent } from "@apidevelopers/contracts";

function defaultNow() {
  return new Date().toISOString();
}

export function createGatewayGlobalTrustAudit({
  sink = async () => {},
  now = defaultNow,
  idFactory = randomUUID,
} = {}) {
  if (typeof sink !== "function") {
    throw new TypeError("sink must be a function");
  }
  if (typeof now !== "function") {
    throw new TypeError("now must be a function");
  }
  if (typeof idFactory !== "function") {
    throw new TypeError("idFactory must be a function");
  }

  return Object.freeze({
    async recordTenantContextIssued({
      identity,
      tenantContext,
      method,
      url,
      correlationId,
    } = {}) {
      const actorId = identity?.principal?.id;
      const effectiveCorrelationId = correlationId || idFactory();
      const event = createAuditEvent({
        eventId: idFactory(),
        tenantId: tenantContext?.tenantId,
        actorId,
        action: "gateway.tenant_context.issued",
        resource: `${String(method || "GET").toUpperCase()} ${url || "/"}`,
        outcome: "success",
        correlationId: effectiveCorrelationId,
        occurredAt: now(),
        metadata: {
          route: url || "/",
          method: String(method || "GET").toUpperCase(),
          region: tenantContext?.region,
          isolationMode: tenantContext?.isolationMode,
          scopeCount: Array.isArray(tenantContext?.scopes) ? tenantContext.scopes.length : 0,
        },
      });

      await sink(event);
      return event;
    },
  });
}
