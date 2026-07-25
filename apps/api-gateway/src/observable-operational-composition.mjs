import {
  createDurableAuditLog,
  createDurableObservabilityApp,
} from "./durable-observability.mjs";
import { createOperationalGateway } from "./operational-composition.mjs";

export function createObservableOperationalGateway({
  auditRetention = 1_000,
  auditIdFactory,
  auditClock,
  protection = {},
  ...gatewayOptions
} = {}) {
  const operational = createOperationalGateway({
    ...gatewayOptions,
    protection,
  });

  if (!operational.metrics) {
    throw new Error("operational protection must expose metrics");
  }

  const auditLog = createDurableAuditLog({
    store: operational.store,
    retention: auditRetention,
    ...(auditIdFactory ? { idFactory: auditIdFactory } : {}),
    ...(auditClock ? { clock: auditClock } : {}),
  });

  const app = createDurableObservabilityApp({
    app: operational.app,
    authenticator: operational.authenticator,
    metrics: operational.metrics,
    auditLog,
  });

  return Object.freeze({
    ...operational,
    app,
    auditLog,
    metrics: operational.metrics,
  });
}