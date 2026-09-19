import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

function memoryRepo() {
  const rows = new Map();
  return {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list({ where }) {
      return [...rows.values()].filter((row) => Object.entries(where).every(([k, v]) => row[k] === v));
    },
  };
}

const base = {
  bindingId: "binding-1",
  tenantId: "tenant-1",
  workspaceId: "workspace-1",
  provider: "meta_whatsapp",
  channelId: "5548912345678",
  credentialRef: "secret://zuni/binding-1",
  metadata: { displayName: "Test WhatsApp" },
};

test("upsert, get and list remain tenant/workspace scoped", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await store.upsert(base);
  assert.equal((await store.get({ bindingId: "binding-1", tenantId: "tenant-1", workspaceId: "workspace-1" })).channelId, base.channelId);
  assert.equal((await store.list("tenant-1", "workspace-1", { provider: "meta_whatsapp", status: "active" })).length, 1);
  await assert.rejects(() => store.get({ bindingId: "binding-1", tenantId: "tenant-2", workspaceId: "workspace-1" }), /boundary mismatch/);
});

test("cross-tenant upsert of an existing binding fails closed", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await store.upsert(base);
  await assert.rejects(() => store.upsert({ ...base, tenantId: "tenant-2" }), /boundary mismatch/);
});

test("secret material is rejected from metadata", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await assert.rejects(() => store.upsert({ ...base, metadata: { accessToken: "NEVER" } }), /must not contain accessToken/);
});
