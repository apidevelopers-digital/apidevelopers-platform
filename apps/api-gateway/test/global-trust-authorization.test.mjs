import assert from "node:assert/strict";
import test from "node:test";

import { createGatewayAuthorizationService } from "../src/global-trust-authorization.mjs";

test("allows when all required scopes are present", () => {
  const service = createGatewayAuthorizationService({
    idFactory: () => "decision_001",
    now: () => "2026-07-28T12:00:00.000Z",
  });
  const decision = service.decide({
    identity: { principal: { id: "actor_001", tenantId: "tenant_001", scopes: ["audit:read"] } },
    action: "audit.events.read",
    resource: "tenant:tenant_001:audit-events",
    requiredScopes: ["audit:read"],
  });

  assert.equal(decision.effect, "allow");
  assert.deepEqual(decision.reasonCodes, ["required_scopes_satisfied"]);
  assert.equal(decision.humanApprovalRequired, false);
  assert.equal(Object.isFrozen(decision), true);
});

test("denies by default when a required scope is missing", () => {
  const service = createGatewayAuthorizationService({
    idFactory: () => "decision_002",
    now: () => "2026-07-28T12:00:00.000Z",
  });
  const decision = service.decide({
    identity: { principal: { id: "actor_002", tenantId: "tenant_002", scopes: [] } },
    action: "audit.events.read",
    resource: "tenant:tenant_002:audit-events",
    requiredScopes: ["audit:read"],
  });

  assert.equal(decision.effect, "deny");
  assert.deepEqual(decision.reasonCodes, ["missing_scope:audit:read"]);
});