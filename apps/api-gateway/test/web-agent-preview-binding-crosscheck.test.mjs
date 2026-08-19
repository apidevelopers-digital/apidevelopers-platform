import assert from "node:assert/strict";
import test from "node:test";

import { createUniCoPreviewSaasAccessResolver } from "../src/web-agent-preview-saas-access.mjs";

test("uni.co preview rejects delegated identity binding that differs from the active Platform grant", async () => {
  const resolveAccess = createUniCoPreviewSaasAccessResolver({
    accessRuntime: {
      async resolveActiveGrant() {
        return {
          resolved: true,
          reason: null,
          grant: {
            accessGrantId: "grant.platform",
            tenantId: "tenant.preview",
            principalId: "principal.preview",
            workspaceId: "workspace.platform",
            productId: "product:uni-co",
            status: "active",
            requiredScopes: ["web:chat"],
          },
        };
      },
    },
  });

  await assert.rejects(
    () =>
      resolveAccess({
        identity: {
          principalId: "principal.preview",
          tenantId: "tenant.preview",
          expectedBinding: {
            workspaceId: "workspace.backend",
            accessGrantId: "grant.backend",
            productId: "product:uni-co",
          },
        },
        productId: "product:uni-co",
        requiredScopes: ["web:chat"],
      }),
    /preview_identity_binding_mismatch/,
  );
});
