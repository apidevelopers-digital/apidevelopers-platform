import test from "node:test";
import assert from "node:assert/strict";
import { createTenantContext } from "../src/tenancy-context.mjs";

test("runtime evidence tenant fixture", () => {
  const tenantContext = createTenantContext({
    tenantId: "tenant_demo_0001",
    principalId: "principal.operator",
    requestId: "request.evidence.0001",
    createdAt: "2026-07-19T06:00:00.000Z",
  });
  assert.equal(tenantContext.tenantId, "tenant_demo_0001");
});
