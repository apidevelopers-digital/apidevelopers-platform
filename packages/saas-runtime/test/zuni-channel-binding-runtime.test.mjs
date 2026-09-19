import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createCanonicalId } from "../../contracts/src/canonical-ids.mjs";
import { createTenantId, createWorkspaceId } from "../../contracts/src/saas-tenancy.mjs";
import { createChannelBindingId } from "../../contracts/src/saas-channel-binding.mjs";
import { createSaasRuntime, createZuniChannelBindingRuntime } from "../src/index.mjs";

const T0 = "2026-09-15T01:30:00.000Z";

async function withRuntime(work) {
  const dir = await mkdtemp(join(tmpdir(), "apd-zuni-channel-binding-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const saasRuntime = createSaasRuntime({ store, clock: () => T0 });
  const channelRuntime = createZuniChannelBindingRuntime({ store, saasRuntime });
  const runtime = Object.freeze({ ...saasRuntime, ...channelRuntime });
  try {
    return await work({ runtime, store });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function ids(tenantSlug, workspaceSlug = "principal") {
  return {
    tenantId: createTenantId(tenantSlug),
    organizationId: createCanonicalId({
      family: "component",
      segments: ["organization", tenantSlug],
    }),
    workspaceId: createWorkspaceId(tenantSlug, workspaceSlug),
    bindingId: createChannelBindingId(tenantSlug, workspaceSlug, "phone-123"),
  };
}

async function seed(runtime, tenantSlug, workspaceSlug = "principal") {
  const x = ids(tenantSlug, workspaceSlug);
  await runtime.registerTenantWorkspace({
    tenant: {
      tenantId: x.tenantId,
      organizationId: x.organizationId,
      slug: tenantSlug,
      displayName: tenantSlug,
      status: "active",
      createdAt: T0,
    },
    workspace: {
      workspaceId: x.workspaceId,
      tenantId: x.tenantId,
      productId: "zuni",
      slug: workspaceSlug,
      displayName: "Zuni",
      status: "active",
      createdAt: T0,
    },
  });
  return x;
}

function binding(x, overrides = {}) {
  return {
    tenantId: x.tenantId,
    workspaceId: x.workspaceId,
    productId: "zuni",
    provider: "meta",
    channelType: "whatsapp_business",
    channelId: "phone-123",
    wabaId: "waba-123",
    phoneNumberId: "phone-123",
    credentialRef: "credential://zuni/acme/principal/phone-123",
    status: "active",
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

test("zero channels is a valid tenant-scoped state", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime, "acme");
    const rows = await runtime.listChannelBindings({
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
    });
    assert.deepEqual(rows, []);
  });
});

test("platform derives the canonical binding id from authoritative tenant and workspace scope", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime, "acme");
    const created = await runtime.registerChannelBinding(binding(acme));
    assert.equal(created.bindingId, acme.bindingId);

    await assert.rejects(
      () => runtime.registerChannelBinding(binding(acme, {
        bindingId: createChannelBindingId("other", "principal", "phone-123"),
      })),
      /channel binding id boundary mismatch/,
    );
  });
});

test("persists only an opaque credential reference for a Zuni WhatsApp channel", async () => {
  await withRuntime(async ({ runtime, store }) => {
    const acme = await seed(runtime, "acme");
    const created = await runtime.registerChannelBinding(binding(acme));
    assert.equal(created.bindingId, acme.bindingId);
    assert.equal(created.credentialRef, "credential://zuni/acme/principal/phone-123");
    assert.equal("accessToken" in created, false);

    const reopenedSaas = createSaasRuntime({ store, clock: () => T0 });
    const reopenedChannel = createZuniChannelBindingRuntime({ store, saasRuntime: reopenedSaas });
    const persisted = await reopenedChannel.getChannelBinding({
      bindingId: acme.bindingId,
      tenantId: acme.tenantId,
      workspaceId: acme.workspaceId,
    });
    assert.equal(persisted.phoneNumberId, "phone-123");
    assert.equal(persisted.credentialRef, "credential://zuni/acme/principal/phone-123");
    assert.equal("accessToken" in persisted, false);
  });
});

test("rejects secret material in the channel binding payload", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime, "acme");
    await assert.rejects(
      () => runtime.registerChannelBinding(binding(acme, { accessToken: "do-not-store" })),
      /must not contain secret material/,
    );
  });
});

test("blocks cross-tenant channel binding and scoped reads", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime, "acme");
    const other = await seed(runtime, "other");

    await assert.rejects(
      () => runtime.registerChannelBinding(binding(acme, {
        workspaceId: other.workspaceId,
      })),
      /workspace tenant boundary mismatch/,
    );

    await runtime.registerChannelBinding(binding(acme));

    const otherRows = await runtime.listChannelBindings({
      tenantId: other.tenantId,
      workspaceId: other.workspaceId,
    });
    assert.deepEqual(otherRows, []);

    const crossTenantRead = await runtime.getChannelBinding({
      bindingId: acme.bindingId,
      tenantId: other.tenantId,
      workspaceId: other.workspaceId,
    });
    assert.equal(crossTenantRead, null);
  });
});

test("same deterministic binding is idempotent but conflicting payload is rejected", async () => {
  await withRuntime(async ({ runtime }) => {
    const acme = await seed(runtime, "acme");
    const first = await runtime.registerChannelBinding(binding(acme));
    const second = await runtime.registerChannelBinding(binding(acme));
    assert.deepEqual(second, first);

    await assert.rejects(
      () => runtime.registerChannelBinding(binding(acme, {
        credentialRef: "credential://zuni/acme/principal/other",
      })),
      /already exists with different payload/,
    );
  });
});
