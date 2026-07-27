import assert from "node:assert/strict";
import test from "node:test";

import {
  createGatewayGlobalTrustTenantContext,
} from "../src/global-trust-context.mjs";

test("creates a strict tenant context for the gateway", () => {
  const context = createGatewayGlobalTrustTenantContext({
    tenantId: "tenant_acme",
    region: "br-south",
    scopes: ["gateway:read", "gateway:write", "gateway:read"],
  });

  assert.equal(context.contractType, "TenantContext");
  assert.equal(context.tenantId, "tenant_acme");
  assert.equal(context.region, "br-south");
  assert.equal(context.isolationMode, "strict");
  assert.equal(context.crossTenantAccessAllowed, false);
  assert.deepEqual(context.scopes, ["gateway:read", "gateway:write"]);
  assert.equal(Object.isFrozen(context), true);
});

test("rejects invalid scope input before creating a contract", () => {
  assert.throws(
    () => createGatewayGlobalTrustTenantContext({
      tenantId: "tenant_acme",
      scopes: ["gateway:read", ""],
    }),
    /non-empty string/,
  );
});
