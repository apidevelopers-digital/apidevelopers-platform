
import { createFixedWindowRateLimiter } from "./operational-protection.mjs";
import {
  createOperationalGatewayWithHostingerStructure,
} from "./operator-hostinger-structure-composition.mjs";
import {
  createOperatorReadonlyCore,
  createUnavailableOperatorReadonlyAdapters,
} from "./operator-readonly-core.mjs";
import { createOperatorReadonlyHttpApp } from "./operator-readonly-http.mjs";

export function createOperationalGatewayWithReadonlyOperator({
  operatorReadonlyAdapters,
  operatorReadonlyNow,
  operatorReadonlyMaxBodyBytes,
  operatorReadonlyRateLimiter,
  ...operationalOptions
} = {}) {
  const sharedRateLimiter =
    operatorReadonlyRateLimiter ??
    operationalOptions.protection?.rateLimiter ??
    createFixedWindowRateLimiter();

  const protection = operationalOptions.protection
    ? Object.freeze({
        ...operationalOptions.protection,
        rateLimiter:
          operationalOptions.protection.rateLimiter ?? sharedRateLimiter,
      })
    : Object.freeze({ rateLimiter: sharedRateLimiter });

  const base = createOperationalGatewayWithHostingerStructure({
    ...operationalOptions,
    protection,
  });
  const adapters =
    operatorReadonlyAdapters ?? createUnavailableOperatorReadonlyAdapters();
  const operatorReadonlyCore = createOperatorReadonlyCore({
    adapters,
    auditRecorder: base.audit,
    ...(operatorReadonlyNow ? { now: operatorReadonlyNow } : {}),
  });
  const app = createOperatorReadonlyHttpApp({
    app: base.app,
    authenticator: base.authenticator,
    authorization: base.authorization,
    core: operatorReadonlyCore,
    audit: base.audit,
    rateLimiter: sharedRateLimiter,
    ...(operatorReadonlyMaxBodyBytes
      ? { maxBodyBytes: operatorReadonlyMaxBodyBytes }
      : {}),
  });

  return Object.freeze({
    ...base,
    operatorReadonlyAdapters: adapters,
    operatorReadonlyCore,
    operatorReadonlyRateLimiter: sharedRateLimiter,
    app,
  });
}
