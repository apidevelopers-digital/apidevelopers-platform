import {
  GatewayDomainError,
  assertNoSensitiveData,
  deepFreeze,
  requireIso,
  requireText,
} from "./common.mjs";
import { createGatewayRequest, isTerminalGatewayRequest } from "./model.mjs";
import { createMemoryGatewayRepository } from "./repository.mjs";

function assertMethod(target, method, name) {
  if (typeof target?.[method] !== "function") {
    throw new GatewayDomainError("invalid_dependency", `${name}.${method} must be a function`);
  }
}

function normalizeBlock(error, source) {
  return {
    source,
    code: requireText(error?.code ?? `${source}_denied`, "block.code"),
    message: requireText(error?.message ?? `${source} denied request`, "block.message"),
  };
}

export function createGatewayService({
  repository = createMemoryGatewayRepository(),
  entitlementService,
  limitsService,
  usageService,
  idFactory,
  clock = () => new Date().toISOString(),
} = {}) {
  assertMethod(entitlementService, "assertAccess", "entitlementService");
  assertMethod(limitsService, "evaluate", "limitsService");
  assertMethod(usageService, "recordUsage", "usageService");
  if (typeof idFactory !== "function") {
    throw new GatewayDomainError("invalid_argument", "idFactory must be a function");
  }

  const now = () => requireIso(clock(), "clock");
  const nextId = () => requireText(idFactory(), "idFactory result");

  function event(type, snapshot, at, data = {}) {
    return deepFreeze({
      type,
      requestId: snapshot.requestId,
      tenantId: snapshot.principal.tenantId,
      projectId: snapshot.principal.projectId,
      apiKeyId: snapshot.principal.apiKeyId,
      apiId: snapshot.apiId,
      occurredAt: at,
      data,
    });
  }

  function append(previous, patch, sourceEventId, type, data = {}) {
    const at = now();
    const snapshot = createGatewayRequest({
      ...previous,
      ...patch,
      snapshotId: nextId(),
      revision: previous.revision + 1,
      previousSnapshotId: previous.snapshotId,
      idempotencyKey: previous.idempotencyKey,
      updatedAt: at,
    });
    const stored = repository.append(snapshot);
    return deepFreeze({
      ...stored,
      events: stored.appended
        ? [event(type, stored.snapshot, at, { sourceEventId, ...data })]
        : [],
    });
  }

  function current(requestId) {
    const snapshot = repository.getCurrent(requestId);
    if (!snapshot) {
      throw new GatewayDomainError("gateway_request_not_found", "gateway request was not found", {
        requestId,
      });
    }
    return snapshot;
  }

  return Object.freeze({
    repositoryKind: repository.kind ?? "custom",

    authorize({
      requestId,
      idempotencyKey,
      principal,
      apiId,
      operation,
      entitlementKey = null,
      metric = "requests",
      quantity = 1,
      requestedAt = now(),
      metadata = {},
    }) {
      const duplicate = repository.getByIdempotencyKey(idempotencyKey);
      if (duplicate) {
        return deepFreeze({
          snapshot: duplicate,
          appended: false,
          duplicateOf: duplicate.requestId,
          events: [],
        });
      }
      assertNoSensitiveData(metadata);
      const requested = createGatewayRequest({
        requestId,
        revision: 1,
        idempotencyKey,
        principal,
        apiId,
        operation,
        entitlementKey,
        metric,
        quantity,
        status: "requested",
        entitlement: null,
        limit: null,
        usageEventId: null,
        block: null,
        failure: null,
        previousSnapshotId: null,
        snapshotId: nextId(),
        requestedAt,
        updatedAt: requestedAt,
        completedAt: null,
        metadata,
      });
      const stored = repository.append(requested);
      const requestedEvent = event("gateway.requested", stored.snapshot, requestedAt);

      let entitlement;
      try {
        entitlement = entitlementService.assertAccess({
          subscriptionId: requested.principal.subscriptionId,
          apiId: requested.apiId,
          entitlementKey: requested.entitlementKey,
          requested: requested.quantity,
          at: requested.requestedAt,
        });
      } catch (error) {
        const block = normalizeBlock(error, "entitlement");
        const blocked = append(
          requested,
          { status: "blocked", block, completedAt: now() },
          idempotencyKey,
          "gateway.blocked",
          block,
        );
        return deepFreeze({ ...blocked, events: [requestedEvent, ...blocked.events] });
      }

      let limit;
      try {
        limit = limitsService.evaluate({
          tenantId: requested.principal.tenantId,
          projectId: requested.principal.projectId,
          apiId: requested.apiId,
          operation: requested.operation,
          metric: requested.metric,
          requested: requested.quantity,
          at: requested.requestedAt,
        });
      } catch (error) {
        const block = normalizeBlock(error, "limits");
        const blocked = append(
          requested,
          { status: "blocked", entitlement, block, completedAt: now() },
          idempotencyKey,
          "gateway.blocked",
          block,
        );
        return deepFreeze({ ...blocked, events: [requestedEvent, ...blocked.events] });
      }

      if (limit?.decision?.allowed !== true) {
        const block = {
          source: "limits",
          code: "limit_blocked",
          message: "request exceeds an enforced limit",
        };
        const blocked = append(
          requested,
          { status: "blocked", entitlement, limit, block, completedAt: now() },
          idempotencyKey,
          "gateway.blocked",
          { ...block, action: limit?.decision?.action ?? "block" },
        );
        return deepFreeze({ ...blocked, events: [requestedEvent, ...blocked.events] });
      }

      const authorized = append(
        requested,
        { status: "authorized", entitlement, limit },
        idempotencyKey,
        "gateway.authorized",
        {
          entitlementSnapshotId: entitlement?.snapshot?.id ?? null,
          limitRuleId: limit?.rule?.id ?? null,
          limitAction: limit?.decision?.action ?? "allow",
        },
      );
      return deepFreeze({ ...authorized, events: [requestedEvent, ...authorized.events] });
    },

    complete({ requestId, idempotencyKey, occurredAt = now(), metadata = {} }) {
      const previous = current(requestId);
      if (isTerminalGatewayRequest(previous)) {
        return deepFreeze({
          snapshot: previous,
          appended: false,
          duplicateOf: previous.requestId,
          events: [],
        });
      }
      if (previous.status !== "authorized") {
        throw new GatewayDomainError(
          "gateway_request_not_authorized",
          "only authorized requests can complete",
          { status: previous.status },
        );
      }
      assertNoSensitiveData(metadata);
      const usage = usageService.recordUsage({
        idempotencyKey: requireText(idempotencyKey, "idempotencyKey"),
        tenantId: previous.principal.tenantId,
        projectId: previous.principal.projectId,
        apiKeyId: previous.principal.apiKeyId,
        apiId: previous.apiId,
        operation: previous.operation,
        quantity: previous.quantity,
        occurredAt,
        metadata,
      });
      const usageEventId = requireText(
        usage?.event?.id ?? usage?.usageEventId,
        "usageEventId",
      );
      return append(
        previous,
        { status: "completed", usageEventId, completedAt: occurredAt },
        idempotencyKey,
        "gateway.completed",
        { usageEventId },
      );
    },

    fail({ requestId, idempotencyKey, code, message, stage = "upstream" }) {
      const previous = current(requestId);
      if (isTerminalGatewayRequest(previous)) {
        return deepFreeze({
          snapshot: previous,
          appended: false,
          duplicateOf: previous.requestId,
          events: [],
        });
      }
      const failure = {
        code: requireText(code, "code"),
        stage: requireText(stage, "stage"),
        message: requireText(message, "message"),
      };
      return append(
        previous,
        { status: "failed", failure, completedAt: now() },
        idempotencyKey,
        "gateway.failed",
        failure,
      );
    },

    getCurrent: current,
    listHistory: (requestId) => repository.listHistory(requestId),
  });
}
