import {
  GatewayDomainError,
  assertNoSensitiveData,
  deepFreeze,
  requireIso,
  requirePositiveInteger,
  requireText,
} from "./common.mjs";

export const GATEWAY_STATUSES = Object.freeze([
  "requested",
  "authorized",
  "blocked",
  "completed",
  "failed",
]);

export function normalizePrincipal(input) {
  const principal = {
    apiKeyId: requireText(input?.apiKeyId, "principal.apiKeyId"),
    apiKeyPrefix:
      input?.apiKeyPrefix === null || input?.apiKeyPrefix === undefined
        ? null
        : requireText(input.apiKeyPrefix, "principal.apiKeyPrefix"),
    apiKeyStatus: requireText(input?.apiKeyStatus, "principal.apiKeyStatus"),
    tenantId: requireText(input?.tenantId, "principal.tenantId"),
    projectId: requireText(input?.projectId, "principal.projectId"),
    subscriptionId: requireText(input?.subscriptionId, "principal.subscriptionId"),
  };
  if (principal.apiKeyStatus !== "active") {
    throw new GatewayDomainError("api_key_not_active", "API key must be active", {
      status: principal.apiKeyStatus,
    });
  }
  return principal;
}

export function createGatewayRequest(input) {
  const status = requireText(input.status, "status");
  if (!GATEWAY_STATUSES.includes(status)) {
    throw new GatewayDomainError("invalid_gateway_status", "unsupported gateway status", { status });
  }
  const metadata = input.metadata ?? {};
  assertNoSensitiveData(metadata);

  const request = {
    requestId: requireText(input.requestId, "requestId"),
    revision: requirePositiveInteger(input.revision, "revision"),
    idempotencyKey: requireText(input.idempotencyKey, "idempotencyKey"),
    principal: normalizePrincipal(input.principal),
    apiId: requireText(input.apiId, "apiId"),
    operation: requireText(input.operation, "operation"),
    entitlementKey:
      input.entitlementKey === null || input.entitlementKey === undefined
        ? null
        : requireText(input.entitlementKey, "entitlementKey"),
    metric: requireText(input.metric ?? "requests", "metric"),
    quantity: requirePositiveInteger(input.quantity ?? 1, "quantity"),
    status,
    entitlement: input.entitlement ?? null,
    limit: input.limit ?? null,
    usageEventId:
      input.usageEventId === null || input.usageEventId === undefined
        ? null
        : requireText(input.usageEventId, "usageEventId"),
    block:
      input.block === null || input.block === undefined
        ? null
        : {
            code: requireText(input.block.code, "block.code"),
            source: requireText(input.block.source, "block.source"),
            message: requireText(input.block.message, "block.message"),
          },
    failure:
      input.failure === null || input.failure === undefined
        ? null
        : {
            code: requireText(input.failure.code, "failure.code"),
            stage: requireText(input.failure.stage, "failure.stage"),
            message: requireText(input.failure.message, "failure.message"),
          },
    previousSnapshotId:
      input.previousSnapshotId === null || input.previousSnapshotId === undefined
        ? null
        : requireText(input.previousSnapshotId, "previousSnapshotId"),
    snapshotId: requireText(input.snapshotId, "snapshotId"),
    requestedAt: requireIso(input.requestedAt, "requestedAt"),
    updatedAt: requireIso(input.updatedAt, "updatedAt"),
    completedAt:
      input.completedAt === null || input.completedAt === undefined
        ? null
        : requireIso(input.completedAt, "completedAt"),
    metadata,
  };

  if (request.revision === 1 && request.previousSnapshotId !== null) {
    throw new GatewayDomainError(
      "invalid_previous_snapshot",
      "first revision cannot reference previous snapshot",
    );
  }
  if (
    status === "requested" &&
    (request.entitlement || request.limit || request.block || request.failure)
  ) {
    throw new GatewayDomainError("invalid_requested_state", "requested state cannot have decisions");
  }
  if (
    status === "authorized" &&
    (!request.entitlement || !request.limit || request.block || request.failure)
  ) {
    throw new GatewayDomainError(
      "invalid_authorized_state",
      "authorized state requires entitlement and limit decisions",
    );
  }
  if (status === "blocked" && !request.block) {
    throw new GatewayDomainError("invalid_blocked_state", "blocked state requires block");
  }
  if (status === "completed" && (!request.usageEventId || !request.completedAt)) {
    throw new GatewayDomainError(
      "invalid_completed_state",
      "completed state requires usageEventId and completedAt",
    );
  }
  if (status === "failed" && !request.failure) {
    throw new GatewayDomainError("invalid_failed_state", "failed state requires failure");
  }
  return deepFreeze(request);
}

export function isTerminalGatewayRequest(snapshot) {
  return ["blocked", "completed", "failed"].includes(snapshot.status);
}
