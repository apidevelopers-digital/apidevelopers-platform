import test from "node:test";
import assert from "node:assert/strict";
import {
  assertOutboundTransportApprovalContract,
  assertOutboundTransportAuthorizationContract,
  assertOutboundTransportRequestContract,
  createOutboundTransportApproval,
  createOutboundTransportAuthorization,
  createOutboundTransportExecutionHandoff,
  createOutboundTransportPreview,
  createOutboundTransportRequest,
  outboundTransportExecutionConfirmation,
} from "../src/outbound-transport.mjs";
import { createTenantContext } from "../src/tenancy-context.mjs";

const tenantContext = createTenantContext({
  tenantId: "tenant_demo_0001",
  principalId: "principal.operator",
  requestId: "request.transport.context.0001",
  roles: ["operator"],
  permissions: ["transport.preview", "transport.request"],
  createdAt: "2026-07-27T12:00:00.000Z",
});

const base = {
  tenantContext,
  channel: "whatsapp.wati",
  destinationRef: "destination.contact.0001",
  payloadRef: "payload.message.0001",
  contentHash: "a".repeat(64),
  idempotencyKey: "idempotency.transport.0001",
  policyDecisionId: "policy.transport.0001",
  requestedBy: "principal.operator",
  requestedAt: "2026-07-27T12:01:00.000Z",
};

test("creates an immutable preview-only outbound transport contract", () => {
  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0001",
    requestedMode: "preview",
  });
  const preview = createOutboundTransportPreview({
    previewId: "preview.transport.0001",
    request,
    generatedAt: "2026-07-27T12:02:00.000Z",
  });

  assert.equal(assertOutboundTransportRequestContract(request), request);
  assert.equal(request.constraints.automaticSendAllowed, false);
  assert.equal(request.constraints.payloadInlineAllowed, false);
  assert.equal(preview.state, "previewed");
  assert.equal(preview.executionReady, false);
  assert.equal(preview.transportExecuted, false);
  assert.equal(preview.sideEffectsPerformed, false);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.tenantContext), true);
  assert.equal(Object.isFrozen(preview), true);
});

test("creates an execution handoff only with exact fresh bindings", () => {
  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0002",
    idempotencyKey: "idempotency.transport.0002",
    requestedMode: "execute",
    evidenceRefs: ["evidence.transport.0001"],
  });
  const approval = createOutboundTransportApproval({
    approvalId: "approval.transport.0001",
    request,
    approvedBy: "principal.igor",
    approvedAt: "2026-07-27T12:03:00.000Z",
    expiresAt: "2026-07-27T12:13:00.000Z",
  });
  const authorization = createOutboundTransportAuthorization({
    authorizationId: "authorization.transport.0001",
    request,
    evaluatedAt: "2026-07-27T12:04:00.000Z",
    expiresAt: "2026-07-27T12:14:00.000Z",
  });
  const handoff = createOutboundTransportExecutionHandoff({
    handoffId: "handoff.transport.0001",
    request,
    approval,
    authorization,
    confirmation: outboundTransportExecutionConfirmation,
    now: "2026-07-27T12:05:00.000Z",
  });

  assert.equal(
    assertOutboundTransportApprovalContract(approval, "approval", {
      request,
      now: "2026-07-27T12:05:00.000Z",
    }),
    approval,
  );
  assert.equal(
    assertOutboundTransportAuthorizationContract(authorization, "authorization", {
      request,
      now: "2026-07-27T12:05:00.000Z",
    }),
    authorization,
  );
  assert.equal(handoff.executionReady, true);
  assert.equal(handoff.transportExecuted, false);
  assert.equal(handoff.sideEffectsPerformed, false);
  assert.equal(handoff.automaticSendAllowed, false);
  assert.equal(handoff.crossTenantAccessAllowed, false);
  assert.equal(handoff.replayAllowed, false);
  assert.equal(Object.isFrozen(handoff), true);
});

test("rejects raw destinations and inline payloads", () => {
  assert.throws(
    () =>
      createOutboundTransportRequest({
        ...base,
        requestId: "request.transport.0003",
        destinationRef: "+5548999999999",
      }),
    /opaque destination reference/,
  );

  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0004",
  });
  const tampered = structuredClone(request);
  tampered.payload = { text: "must never be inline" };
  assert.throws(
    () => assertOutboundTransportRequestContract(tampered),
    /must not contain inline destination or payload/,
  );
});

test("rejects execute requests without evidence", () => {
  assert.throws(
    () =>
      createOutboundTransportRequest({
        ...base,
        requestId: "request.transport.0005",
        requestedMode: "execute",
      }),
    /evidenceRefs are required/,
  );
});

test("rejects stale, replayed and mismatched approval bindings", () => {
  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0006",
    idempotencyKey: "idempotency.transport.0006",
    requestedMode: "execute",
    evidenceRefs: ["evidence.transport.0002"],
  });
  const approval = createOutboundTransportApproval({
    approvalId: "approval.transport.0002",
    request,
    approvedBy: "principal.igor",
    approvedAt: "2026-07-27T12:03:00.000Z",
    expiresAt: "2026-07-27T12:06:00.000Z",
  });

  assert.throws(
    () =>
      assertOutboundTransportApprovalContract(approval, "approval", {
        request,
        now: "2026-07-27T12:07:00.000Z",
      }),
    /must be fresh/,
  );

  const replayed = { ...approval, replayed: true };
  assert.throws(
    () =>
      assertOutboundTransportApprovalContract(replayed, "approval", {
        request,
        now: "2026-07-27T12:05:00.000Z",
      }),
    /replay is blocked/,
  );

  const mismatch = { ...approval, contentHash: "b".repeat(64) };
  assert.throws(
    () =>
      assertOutboundTransportApprovalContract(mismatch, "approval", {
        request,
        now: "2026-07-27T12:05:00.000Z",
      }),
    /contentHash mismatch/,
  );
});

test("rejects execution without the exact explicit confirmation", () => {
  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0007",
    idempotencyKey: "idempotency.transport.0007",
    requestedMode: "execute",
    evidenceRefs: ["evidence.transport.0003"],
  });
  const approval = createOutboundTransportApproval({
    approvalId: "approval.transport.0003",
    request,
    approvedBy: "principal.igor",
    approvedAt: "2026-07-27T12:03:00.000Z",
    expiresAt: "2026-07-27T12:13:00.000Z",
  });
  const authorization = createOutboundTransportAuthorization({
    authorizationId: "authorization.transport.0003",
    request,
    evaluatedAt: "2026-07-27T12:04:00.000Z",
    expiresAt: "2026-07-27T12:14:00.000Z",
  });

  assert.throws(
    () =>
      createOutboundTransportExecutionHandoff({
        handoffId: "handoff.transport.0003",
        request,
        approval,
        authorization,
        confirmation: "YES",
        now: "2026-07-27T12:05:00.000Z",
      }),
    /explicit outbound transport confirmation is required/,
  );
});

test("rejects authorization binding drift and automatic send", () => {
  const request = createOutboundTransportRequest({
    ...base,
    requestId: "request.transport.0008",
    idempotencyKey: "idempotency.transport.0008",
    requestedMode: "execute",
    evidenceRefs: ["evidence.transport.0004"],
  });
  const authorization = createOutboundTransportAuthorization({
    authorizationId: "authorization.transport.0004",
    request,
    evaluatedAt: "2026-07-27T12:04:00.000Z",
    expiresAt: "2026-07-27T12:14:00.000Z",
  });

  assert.throws(
    () =>
      assertOutboundTransportAuthorizationContract(
        { ...authorization, tenantId: "tenant_foreign_0001" },
        "authorization",
        { request, now: "2026-07-27T12:05:00.000Z" },
      ),
    /tenantId mismatch/,
  );

  assert.throws(
    () =>
      assertOutboundTransportAuthorizationContract(
        { ...authorization, automaticSendAllowed: true },
        "authorization",
        { request, now: "2026-07-27T12:05:00.000Z" },
      ),
    /automaticSendAllowed must be false/,
  );
});

console.log("OUTBOUND_TRANSPORT_CONTRACT_GATE_OK");
