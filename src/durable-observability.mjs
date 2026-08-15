import { randomUUID } from "node:crypto";

import { authorize } from "@apidevelopers/auth-core";
import { createDurableRepository } from "@apidevelopers/persistence-core";

const COLLECTION = "gateway_audit_events";
const JSON_HEADERS = Object.freeze({
  "content-type": "application/json; charset=utf-8",
});

function requireFunction(value, name) {
  if (typeof value !== "function") throw new TypeError(`${name} must be a function`);
  return value;
}

function requirePositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function sanitizeEvent(event = {}) {
  const allowed = [
    "type",
    "occurredAt",
    "method",
    "route",
    "outcome",
    "status",
    "credentialFingerprint",
    "resetAt",
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => event[key] !== undefined)
      .map((key) => [key, structuredClone(event[key])]),
  );
}

function jsonResponse(status, payload) {
  return {
    status,
    headers: JSON_HEADERS,
    body: JSON.stringify(payload),
  };
}

export function createDurableAuditLog({
  store,
  retention = 1_000,
  idFactory = randomUUID,
  clock = () => new Date().toISOString(),
} = {}) {
  requirePositiveInteger(retention, "retention");
  requireFunction(idFactory, "idFactory");
  requireFunction(clock, "clock");

  const repository = createDurableRepository({
    store,
    collection: COLLECTION,
  });

  return Object.freeze({
    async append(event) {
      const safe = sanitizeEvent(event);
      const record = Object.freeze({
        id: idFactory(),
        occurredAt: safe.occurredAt ?? clock(),
        ...safe,
      });
      await repository.create(record);

      const records = await repository.list();
      const excess = records
        .slice()
        .sort((left, right) =>
          String(left.occurredAt).localeCompare(String(right.occurredAt)),
        )
        .slice(0, Math.max(0, records.length - retention));

      for (const stale of excess) await repository.delete(stale.id);
      return structuredClone(record);
    },

    async list({ limit = 100 } = {}) {
      requirePositiveInteger(limit, "limit");
      const records = await repository.list();
      return Object.freeze(
        records
          .slice()
          .sort((left, right) =>
            String(right.occurredAt).localeCompare(String(left.occurredAt)),
          )
          .slice(0, limit)
          .map((record) => Object.freeze(structuredClone(record))),
      );
    },
  });
}

export function createDurableObservabilityApp({
  app,
  authenticator,
  metrics,
  auditLog,
  metricsPath = "/v1/metrics",
} = {}) {
  if (typeof app?.handleRequest !== "function") {
    throw new TypeError("app.handleRequest must be a function");
  }
  if (typeof authenticator?.authenticate !== "function") {
    throw new TypeError("authenticator.authenticate must be a function");
  }
  if (typeof metrics?.snapshot !== "function") {
    throw new TypeError("metrics.snapshot must be a function");
  }
  if (typeof auditLog?.append !== "function" || typeof auditLog?.list !== "function") {
    throw new TypeError("auditLog must provide append and list");
  }

  return Object.freeze({
    metrics,
    auditLog,

    async handleRequest(request = {}) {
      const method = String(request.method ?? "GET").toUpperCase();
      const url = String(request.url ?? "/");

      if (method === "GET" && url === metricsPath) {
        const identity = await authenticator.authenticate(request.headers ?? {});
        if (!identity) return jsonResponse(401, { error: "unauthorized" });

        const decision = authorize(identity, {
          scopes: ["observability:read"],
        });
        if (!decision.allowed) {
          return jsonResponse(403, {
            error: "forbidden",
            reason: decision.reason,
          });
        }

        const recentAudit = await auditLog.list({ limit: 20 });
        return jsonResponse(200, {
          metrics: metrics.snapshot(),
          audit: {
            recent: recentAudit,
            count: recentAudit.length,
          },
        });
      }

      const response = await app.handleRequest(request);
      if (url !== "/health") {
        await auditLog.append({
          type: "gateway.request_completed",
          occurredAt: new Date().toISOString(),
          method,
          route: url,
          status: response.status,
          outcome:
            response.status === 200
              ? "success"
              : response.status === 401
                ? "unauthorized"
                : response.status === 429
                  ? "rate_limited"
                  : "other",
        });
      }
      return response;
    },
  });
}