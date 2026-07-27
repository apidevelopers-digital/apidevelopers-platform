import {
  outboundTransportAssertBoolean,
  outboundTransportAssertContractVersion,
  outboundTransportAssertHash,
  outboundTransportAssertIsoDate,
  outboundTransportAssertObject,
  outboundTransportAssertOpaqueReference,
  outboundTransportAssertRequestBindings,
  outboundTransportAssertString,
  outboundTransportClone,
  outboundTransportContractVersion,
  outboundTransportDeepFreeze,
  outboundTransportExecutionConfirmation,
} from "./outbound-transport-common.mjs";
import {
  assertOutboundTransportRequestContract,
} from "./outbound-transport-request.mjs";

export function assertOutboundTransportApprovalContract(
  approval,
  name = "outboundTransportApproval",
  { request, now = new Date().toISOString(), requireFresh = true } = {},
) {
  outboundTransportAssertObject(approval, name);
  outboundTransportAssertContractVersion(approval.schemaVersion, name);

  for (const field of [
    "approvalId",
    "requestId",
    "tenantId",
    "destinationRef",
    "contentHash",
    "idempotencyKey",
    "approvedBy",
    "approvedAt",
    "expiresAt",
    "status",
  ]) {
    outboundTransportAssertString(approval[field], `${name}.${field}`);
  }

  outboundTransportAssertOpaqueReference(
    approval.approvalId,
    `${name}.approvalId`,
    "approval",
  );
  outboundTransportAssertHash(approval.contentHash, `${name}.contentHash`);
  if (approval.status !== "approved") {
    throw new Error(`${name}.status must be approved`);
  }
  if (
    approval.consumedAt !== null ||
    approval.replayed === true ||
    approval.used === true
  ) {
    throw new Error(`${name} replay is blocked`);
  }

  const approvedAt = outboundTransportAssertIsoDate(
    approval.approvedAt,
    `${name}.approvedAt`,
  );
  const expiresAt = outboundTransportAssertIsoDate(
    approval.expiresAt,
    `${name}.expiresAt`,
  );
  const nowAt = outboundTransportAssertIsoDate(now, `${name}.now`);
  if (expiresAt <= approvedAt) {
    throw new Error(`${name}.expiresAt must be after approvedAt`);
  }
  if (approvedAt > nowAt) {
    throw new Error(`${name}.approvedAt must not be in the future`);
  }
  if (requireFresh && expiresAt <= nowAt) {
    throw new Error(`${name} must be fresh`);
  }

  if (request) {
    assertOutboundTransportRequestContract(request, "request");
    if (request.requestedMode !== "execute") {
      throw new Error(`${name} requires an execute request`);
    }
    outboundTransportAssertRequestBindings(approval, request, name);
  }

  return approval;
}

export function createOutboundTransportApproval({
  approvalId,
  request,
  approvedBy,
  approvedAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  assertOutboundTransportRequestContract(request, "request");
  if (request.requestedMode !== "execute") {
    throw new Error("approval requires an execute request");
  }

  const approval = {
    schemaVersion: outboundTransportContractVersion,
    approvalId,
    status: "approved",
    requestId: request.requestId,
    tenantId: request.tenantId,
    destinationRef: request.destinationRef,
    contentHash: request.contentHash,
    idempotencyKey: request.idempotencyKey,
    approvedBy,
    approvedAt,
    expiresAt,
    consumedAt: null,
    replayed: false,
    used: false,
  };

  assertOutboundTransportApprovalContract(
    approval,
    "outboundTransportApproval",
    { request, now: approvedAt, requireFresh: false },
  );
  return outboundTransportDeepFreeze(approval);
}

export function assertOutboundTransportAuthorizationContract(
  authorization,
  name = "outboundTransportAuthorization",
  { request, now = new Date().toISOString(), requireFresh = true } = {},
) {
  outboundTransportAssertObject(authorization, name);
  outboundTransportAssertContractVersion(authorization.schemaVersion, name);

  for (const field of [
    "authorizationId",
    "policyDecisionId",
    "requestId",
    "tenantId",
    "destinationRef",
    "contentHash",
    "idempotencyKey",
    "effect",
    "evaluatedAt",
    "expiresAt",
  ]) {
    outboundTransportAssertString(authorization[field], `${name}.${field}`);
  }

  outboundTransportAssertOpaqueReference(
    authorization.authorizationId,
    `${name}.authorizationId`,
    "authorization",
  );
  outboundTransportAssertOpaqueReference(
    authorization.policyDecisionId,
    `${name}.policyDecisionId`,
    "policy",
  );
  outboundTransportAssertHash(
    authorization.contentHash,
    `${name}.contentHash`,
  );

  if (authorization.effect !== "allow") {
    throw new Error(`${name}.effect must be allow`);
  }
  for (const [field, expected] of Object.entries({
    executionAllowed: true,
    mutationAllowed: true,
    automaticSendAllowed: false,
    crossTenantAccessAllowed: false,
    replayAllowed: false,
  })) {
    outboundTransportAssertBoolean(
      authorization[field],
      expected,
      `${name}.${field}`,
    );
  }

  const evaluatedAt = outboundTransportAssertIsoDate(
    authorization.evaluatedAt,
    `${name}.evaluatedAt`,
  );
  const expiresAt = outboundTransportAssertIsoDate(
    authorization.expiresAt,
    `${name}.expiresAt`,
  );
  const nowAt = outboundTransportAssertIsoDate(now, `${name}.now`);
  if (expiresAt <= evaluatedAt) {
    throw new Error(`${name}.expiresAt must be after evaluatedAt`);
  }
  if (evaluatedAt > nowAt) {
    throw new Error(`${name}.evaluatedAt must not be in the future`);
  }
  if (requireFresh && expiresAt <= nowAt) {
    throw new Error(`${name} must be fresh`);
  }

  if (request) {
    assertOutboundTransportRequestContract(request, "request");
    if (request.requestedMode !== "execute") {
      throw new Error(`${name} requires an execute request`);
    }
    outboundTransportAssertRequestBindings(authorization, request, name);
    if (authorization.policyDecisionId !== request.policyDecisionId) {
      throw new Error(`${name}.policyDecisionId mismatch`);
    }
  }

  return authorization;
}

export function createOutboundTransportAuthorization({
  authorizationId,
  request,
  evaluatedAt = new Date().toISOString(),
  expiresAt,
} = {}) {
  assertOutboundTransportRequestContract(request, "request");
  if (request.requestedMode !== "execute") {
    throw new Error("authorization requires an execute request");
  }

  const authorization = {
    schemaVersion: outboundTransportContractVersion,
    authorizationId,
    policyDecisionId: request.policyDecisionId,
    requestId: request.requestId,
    tenantId: request.tenantId,
    destinationRef: request.destinationRef,
    contentHash: request.contentHash,
    idempotencyKey: request.idempotencyKey,
    effect: "allow",
    executionAllowed: true,
    mutationAllowed: true,
    automaticSendAllowed: false,
    crossTenantAccessAllowed: false,
    replayAllowed: false,
    evaluatedAt,
    expiresAt,
  };

  assertOutboundTransportAuthorizationContract(
    authorization,
    "outboundTransportAuthorization",
    { request, now: evaluatedAt, requireFresh: false },
  );
  return outboundTransportDeepFreeze(authorization);
}

export function createOutboundTransportExecutionHandoff({
  handoffId,
  request,
  approval,
  authorization,
  confirmation,
  now = new Date().toISOString(),
} = {}) {
  assertOutboundTransportRequestContract(request, "request");
  if (request.requestedMode !== "execute") {
    throw new Error("execution handoff requires an execute request");
  }
  outboundTransportAssertOpaqueReference(handoffId, "handoffId", "handoff");
  if (confirmation !== outboundTransportExecutionConfirmation) {
    throw new Error(
      "explicit outbound transport confirmation is required",
    );
  }

  assertOutboundTransportApprovalContract(
    approval,
    "outboundTransportApproval",
    { request, now, requireFresh: true },
  );
  assertOutboundTransportAuthorizationContract(
    authorization,
    "outboundTransportAuthorization",
    { request, now, requireFresh: true },
  );

  if (approval.approvalId === authorization.authorizationId) {
    throw new Error(
      "approval and authorization identifiers must be distinct",
    );
  }

  return outboundTransportDeepFreeze({
    schemaVersion: outboundTransportContractVersion,
    handoffId,
    requestId: request.requestId,
    tenantId: request.tenantId,
    channel: request.channel,
    destinationRef: request.destinationRef,
    payloadRef: request.payloadRef,
    contentHash: request.contentHash,
    idempotencyKey: request.idempotencyKey,
    policyDecisionId: request.policyDecisionId,
    approvalId: approval.approvalId,
    authorizationId: authorization.authorizationId,
    evidenceRefs: outboundTransportClone(request.evidenceRefs),
    confirmationVerified: true,
    executionReady: true,
    transportExecuted: false,
    sideEffectsPerformed: false,
    automaticSendAllowed: false,
    crossTenantAccessAllowed: false,
    replayAllowed: false,
    createdAt: now,
  });
}
