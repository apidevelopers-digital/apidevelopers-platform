import { randomUUID } from "node:crypto";

import { createAuditEvent } from "@apidevelopers/contracts";

function defaultNow() {
  return new Date().toISOString();
}

function requireText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
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

  async function persist({
    identity,
    tenantId,
    action,
    resource,
    outcome,
    correlationId,
    metadata,
  }) {
    const actorId = requireText(identity?.principal?.id, "identity.principal.id");
    const resolvedCorrelationId = requireText(
      correlationId || idFactory(),
      "correlationId",
    );
    const event = createAuditEvent({
      eventId: idFactory(),
      tenantId: requireText(tenantId, "tenantId"),
      actorId,
      action: requireText(action, "action"),
      resource: requireText(resource, "resource"),
      outcome: requireText(outcome, "outcome"),
      correlationId: resolvedCorrelationId,
      occurredAt: now(),
      metadata,
    });

    await sink(event);
    return event;
  }

  return Object.freeze({
    async recordTenantContextIssued({
      identity,
      tenantContext,
      method,
      url,
      correlationId,
    } = {}) {
      return persist({
        identity,
        tenantId: tenantContext?.tenantId,
        action: "gateway.tenant_context.issued",
        resource: `${String(method || "GET").toUpperCase()} ${url || "/"}`,
        outcome: "success",
        correlationId,
        metadata: {
          route: url || "/",
          method: String(method || "GET").toUpperCase(),
          region: tenantContext?.region,
          isolationMode: tenantContext?.isolationMode,
          scopeCount: Array.isArray(tenantContext?.scopes)
            ? tenantContext.scopes.length
            : 0,
        },
      });
    },

    async recordOperatorCapabilityResult({
      identity,
      tenantId,
      action,
      resource,
      outcome,
      correlationId,
      metadata = {},
    } = {}) {
      return persist({
        identity,
        tenantId,
        action,
        resource,
        outcome,
        correlationId,
        metadata,
      });
    },
  });
}
