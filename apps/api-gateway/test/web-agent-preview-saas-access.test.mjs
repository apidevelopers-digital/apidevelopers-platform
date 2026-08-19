import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewSaasAccessResolver } from "../src/web-agent-preview-saas-access.mjs";

test("uni.co preview resolves one active SaaS grant for the authenticated principal", async () => {
  const calls = [];
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: {
      async resolveActiveGrant(input) {
        calls.push(input);
        return {
          resolved: true,
          reason: null,
          grant: {
            accessGrantId: "grant.preview.1",
            tenantId: "tenant.preview.1",
            principalId: "principal.preview.1",
            workspaceId: "workspace.preview.1",
            productId: "product:uni-co",
            status: "active",
            requiredScopes: ["web:chat"],
          },
        };
      },
    },
  });

  const result = await resolveAccess({
    identity: {
      principalId: "principal.preview.1",
      tenantId: "tenant.preview.1",
      name: "Preview User",
    },
    productId: "product:uni-co",
    requiredScopes: ["web:chat"],
  });

  assert.deepEqual(calls, [{
    tenantId: "tenant.preview.1",
    principalId: "principal.preview.1",
    productId: "product:uni-co",
  }]);
  assert.deepEqual(result, {
    principalId: "principal.preview.1",
    tenantId: "tenant.preview.1",
    workspaceId: "workspace.preview.1",
    accessGrantId: "grant.preview.1",
  });
});

test("uni.co preview fails closed when no active grant exists", async () => {
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: {
      async resolveActiveGrant() {
        return { resolved: false, reason: "access_grant_not_found", grant: null };
      },
    },
  });

  await assert.rejects(
    () => resolveAccess({
      identity: { principalId: "principal.preview.1", tenantId: "tenant.preview.1" },
      productId: "product:uni-co",
      requiredScopes: ["web:chat"],
    }),
    /access_grant_not_found/,
  );
});

test("uni.co preview fails closed when active grant resolution is ambiguous", async () => {
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: {
      async resolveActiveGrant() {
        return { resolved: false, reason: "access_grant_ambiguous", grant: null };
      },
    },
  });

  await assert.rejects(
    () => resolveAccess({
      identity: { principalId: "principal.preview.1", tenantId: "tenant.preview.1" },
      productId: "product:uni-co",
      requiredScopes: ["web:chat"],
    }),
    /access_grant_ambiguous/,
  );
});

test("uni.co preview rejects cross-product access before querying grants", async () => {
  let called = false;
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: {
      async resolveActiveGrant() {
        called = true;
        return { resolved: false, reason: "should_not_run", grant: null };
      },
    },
  });

  await assert.rejects(
    () => resolveAccess({
      identity: { principalId: "principal.preview.1", tenantId: "tenant.preview.1" },
      productId: "product:nexus",
      requiredScopes: ["web:chat"],
    }),
    /preview_product_not_allowed/,
  );
  assert.equal(called, false);
});
