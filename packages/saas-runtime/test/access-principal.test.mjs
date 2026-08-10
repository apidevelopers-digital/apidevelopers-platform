import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createAccessRuntime } from "../src/index.mjs";

const T0 = "2026-08-10T20:40:00.000Z";

test("denies access when the authenticated principal does not own the grant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-principal-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const access = createAccessRuntime({
    store,
    saasRuntime: {},
    clock: () => T0,
  });

  try {
    await access.grantAccess({
      accessGrantId: "component.access.acme.zuni-main.zuni.user-1",
      principalId: "user-1",
      tenantId: "component.tenant.acme",
      workspaceId: "component.workspace.acme.zuni-main",
      productId: "zuni",
      subscriptionId: "component.subscription.acme.zuni",
      entitlementId: "component.entitlement.acme.zuni-main.templates",
      requiredScopes: ["zuni:use"],
      status: "active",
      createdAt: T0,
      activatedAt: T0,
    });

    const decision = await access.evaluateAccess({
      identity: {
        role: "client",
        principal: {
          id: "user-2",
          tenantId: "component.tenant.acme",
          scopes: ["zuni:use"],
        },
      },
      accessGrantId: "component.access.acme.zuni-main.zuni.user-1",
      tenantId: "component.tenant.acme",
      workspaceId: "component.workspace.acme.zuni-main",
      productId: "zuni",
    });

    assert.deepEqual(decision, {
      allowed: false,
      reason: "access_principal_mismatch",
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
