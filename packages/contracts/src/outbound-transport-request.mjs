import { assertTenantContextContract } from "./tenancy-context.mjs";
import {
  outboundTransportAssertBoolean,
  outboundTransportAssertContractVersion,
  outboundTransportAssertHash,
  outboundTransportAssertIsoDate,
  outboundTransportAssertObject,
  outboundTransportAssertOpaqueReference,
  outboundTransportAssertString,
  outboundTransportClone,
  outboundTransportContractVersion,
  outboundTransportDeepFreeze,
  outboundTransportNormalizeReferences,
} from "./outbound-transport-common.mjs";

const requestModes = new Set(["preview", "execute"]);

export function assertOutboundTransportRequestContract(
  request,
  name = "outboundTransportRequest",
) {
  outboundTransportAssertObject(request, name);
  outboundTransportAssertContractVersion(request.schemaVersion, name);

  for (const field of [
    "requestId",
    "tenantId",
    "channel",
    "destinationRef",
    "payloadRef",
    "contentHash",
    "idempotencyKey",
    "policyDecisionId",
    "requestedBy",
    "requestedAt",
    "requestedMode",
  ]) {
    outboundTransportAssertString(request[field], `${name}.${field}`);
  }

  assertTenantContextContract(request.tenantContext, `${name}.tenantContext`);
  if (request.tenantContext.tenantId !== request.tenantId) {
    throw new Error(`${name}.tenantId mismatch`);
  }

  outboundTransportAssertOpaqueReference(
    request.requestId,
    `${name}.requestId`,
    "request",
  );
  outboundTransportAssertOpaqueReference(
    request.destinationRef,
    `${name}.destinationRef`,
    "destination",
  );
  outboundTransportAssertOpaqueReference(
    request.payloadRef,
    `${name}.payloadRef`,
    "payload",
  );
  outboundTransportAssertOpaqueReference(
    request.policyDecisionId,
    `${name}.policyDecisionId`,
    "policy",
  );
  outboundTransportAssertOpaqueReference(
    request.idempotencyKey,
    `${name}.idempotencyKey`,
    "idempotency",
  );
  outboundTransportAssertHash(request.contentHash, `${name}.contentHash`);
  outboundTransportAssertIsoDate(request.requestedAt, `${name}.requestedAt`);

  if (!requestModes.has(request.requestedMode)) {
    throw new Error(`${name}.requestedMode must be preview or execute`);
  }

  if (
    Object.hasOwn(request, "destination") ||
    Object.hasOwn(request, "payload") ||
    Object.hasOwn(request, "recipient")
  ) {
    throw new Error(`${name} must not contain inline destination or payload`);
  }

  const evidenceRefs = outboundTransportNormalizeReferences(
    request.evidenceRefs,
    `${name}.evidenceRefs`,
  );
  if (request.requestedMode === "execute" && evidenceRefs.length === 0) {
    throw new Error(`${name}.evidenceRefs are required for execute mode`);
  }

  outboundTransportAssertObject(request.constraints, `${name}.constraints`);
  for (const [field, expected] of Object.entries({
    humanApprovalRequired: true,
    policyAuthorizationRequired: true,
    explicitConfirmationRequired: true,
    evidenceRequired: true,
    payloadInlineAllowed: false,
    automaticSendAllowed: false,
    crossTenantAccessAllowed: false,
    replayAllowed: false,
  })) {
    outboundTransportAssertBoolean(
      request.constraints[field],
      expected,
      `${name}.constraints.${field}`,
    );
  }

  return request;
}

export function createOutboundTransportRequest({
  requestId,
  tenantContext,
  channel,
  destinationRef,
  payloadRef,
  contentHash,
  idempotencyKey,
  policyDecisionId,
  requestedBy,
  requestedAt = new Date().toISOString(),
  requestedMode = "preview",
  evidenceRefs = [],
} = {}) {
  const request = {
    schemaVersion: outboundTransportContractVersion,
    requestId,
    tenantId: tenantContext?.tenantId,
    tenantContext: outboundTransportClone(tenantContext),
    channel,
    destinationRef,
    payloadRef,
    contentHash,
    idempotencyKey,
    policyDecisionId,
    requestedBy,
    requestedAt,
    requestedMode,
    evidenceRefs: outboundTransportNormalizeReferences(
      evidenceRefs,
      "evidenceRefs",
    ),
    constraints: {
      humanApprovalRequired: true,
      policyAuthorizationRequired: true,
      explicitConfirmationRequired: true,
      evidenceRequired: true,
      payloadInlineAllowed: false,
      automaticSendAllowed: false,
      crossTenantAccessAllowed: false,
      replayAllowed: false,
    },
  };

  assertOutboundTransportRequestContract(request);
  return outboundTransportDeepFreeze(request);
}

export function createOutboundTransportPreview({
  previewId,
  request,
  generatedAt = new Date().toISOString(),
} = {}) {
  assertOutboundTransportRequestContract(request, "request");
  if (request.requestedMode !== "preview") {
    throw new Error("preview requires a preview request");
  }
  outboundTransportAssertOpaqueReference(previewId, "previewId", "preview");
  outboundTransportAssertIsoDate(generatedAt, "generatedAt");

  return outboundTransportDeepFreeze({
    schemaVersion: outboundTransportContractVersion,
    previewId,
    requestId: request.requestId,
    tenantId: request.tenantId,
    channel: request.channel,
    destinationRef: request.destinationRef,
    payloadRef: request.payloadRef,
    contentHash: request.contentHash,
    idempotencyKey: request.idempotencyKey,
    generatedAt,
    state: "previewed",
    executionReady: false,
    transportExecuted: false,
    sideEffectsPerformed: false,
    automaticSendAllowed: false,
    crossTenantAccessAllowed: false,
  });
}
