import { randomUUID } from "node:crypto";

import { createGlobalTrustIntegrityService } from "./global-trust-integrity.mjs";

export const GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION =
  "global_trust_kill_switch_events";

function required(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new TypeError(`${name} is required`);
  return normalized;
}

function instant(value, name) {
  const normalized = required(value, name);
  if (!Number.isFinite(Date.parse(normalized))) {
    throw new TypeError(`${name} must be an ISO date`);
  }
  return normalized;
}

function tenantEvents(tx, tenantId) {
  return tx.list(GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION)
    .map(({ value }) => value)
    .filter((event) => event?.tenantId === tenantId)
    .sort((left, right) =>
      left.version - right.version
      || left.killSwitchEventId.localeCompare(right.killSwitchEventId)
    );
}

function publicState(tenantId, event, changed = false) {
  return Object.freeze({
    contractType: "GlobalTrustKillSwitchState",
    contractVersion: "1.0",
    tenantId,
    enabled: event?.enabled ?? false,
    version: event?.version ?? 0,
    ...(event
      ? {
          killSwitchEventId: event.killSwitchEventId,
          reasonCode: event.reasonCode,
          changedBy: event.changedBy,
          changedAt: event.changedAt,
          correlationId: event.correlationId,
        }
      : {
          reasonCode: "not_configured",
        }),
    changed,
    sensitiveContentIncluded: false,
  });
}

export class KillSwitchError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.name = "KillSwitchError";
    this.code = code;
    this.status = status;
  }
}

export function createGlobalTrustKillSwitchService({
  store,
  integrity = createGlobalTrustIntegrityService({ store }),
  eventIdFactory = randomUUID,
  now = () => new Date().toISOString(),
} = {}) {
  if (typeof store?.transaction !== "function") {
    throw new TypeError("store.transaction is required");
  }
  if (typeof integrity?.appendInTransaction !== "function") {
    throw new TypeError("integrity.appendInTransaction is required");
  }
  if (typeof eventIdFactory !== "function") {
    throw new TypeError("eventIdFactory is required");
  }
  if (typeof now !== "function") throw new TypeError("now is required");

  return Object.freeze({
    async getTenant({ tenantId } = {}) {
      const tenant = required(tenantId, "tenantId");
      const transaction = await store.transaction((tx) => {
        const events = tenantEvents(tx, tenant);
        return publicState(tenant, events.at(-1));
      });
      return transaction.result;
    },

    async setTenant({
      tenantId,
      identity,
      enabled,
      reasonCode,
      correlationId,
    } = {}) {
      const tenant = required(tenantId, "tenantId");
      const principal = identity?.principal ?? {};
      const changedBy = required(principal.id, "identity.principal.id");
      if (principal.kind !== "human") {
        throw new KillSwitchError(
          "human_operator_required",
          "only a human principal may change the kill switch",
          403,
        );
      }
      if (required(principal.tenantId, "identity.principal.tenantId") !== tenant) {
        throw new KillSwitchError(
          "tenant_mismatch",
          "operator tenant must match the kill switch tenant",
          403,
        );
      }
      if (typeof enabled !== "boolean") {
        throw new KillSwitchError(
          "invalid_state",
          "enabled must be a boolean",
          400,
        );
      }

      const normalizedReason = required(reasonCode, "reasonCode");
      const normalizedCorrelationId = required(correlationId, "correlationId");
      const changedAt = instant(now(), "changedAt");

      const transaction = await store.transaction((tx) => {
        const events = tenantEvents(tx, tenant);
        const current = events.at(-1);

        if ((current?.enabled ?? false) === enabled) {
          return publicState(tenant, current, false);
        }

        const event = Object.freeze({
          contractType: "GlobalTrustKillSwitchEvent",
          contractVersion: "1.0",
          killSwitchEventId: required(eventIdFactory(), "killSwitchEventId"),
          tenantId: tenant,
          version: (current?.version ?? 0) + 1,
          enabled,
          previousEventId: current?.killSwitchEventId ?? null,
          reasonCode: normalizedReason,
          changedBy,
          changedAt,
          correlationId: normalizedCorrelationId,
          sensitiveContentIncluded: false,
        });

        tx.put(
          GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION,
          event.killSwitchEventId,
          event,
          { ifAbsent: true },
        );
        integrity.appendInTransaction(tx, {
          tenantId: tenant,
          sourceCollection: GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION,
          recordId: event.killSwitchEventId,
          payload: event,
        });

        return publicState(tenant, event, true);
      });

      return transaction.result;
    },
  });
}
