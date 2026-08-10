import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasAccessComposition } from "../src/saas-access-composition.mjs";

const T0 = "2026-08-10T20:50:00.000Z";

test("composes SaaS runtime and access on the same durable store", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-gateway-saas-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });

  try {
    const { saasRuntime, saasAccess } = createSaasAccessComposition({
      store,
      clock: () => T0,
    });

    assert.equal(typeof saasRuntime.registerTenantWorkspace, "function");
    assert.equal(typeof saasAccess.evaluateAccess, "function");

    await saasRuntime.registerTenantWorkspace({
      tenant: {
        tenantId: "component.tenant.acme",
        organizationId: "component.organization.acme",
        slug: "acme",
        displayName: "Acme",
        status: "active",
        createdAt: T0,
      },
      workspace: {
        workspaceId: "component.workspace.acme.zuni-main",
        tenantId: "component.tenant.acme",
        productId: "zuni",
        slug: "zuni-main",
        displayName: "Zuni Main",
        status: "active",
        createdAt: T0,
      },
    });

    const persisted = await saasRuntime.getTenant("component.tenant.acme");
    assert.equal(persisted.slug, "acme");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
