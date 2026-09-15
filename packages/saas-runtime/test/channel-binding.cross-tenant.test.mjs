import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

function memoryRepo() {
  const rows = new Map();
  return {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list({ where }) { return [...rows.values()].filter((row) => Object.entries(wher).every(([k, v]) => row[k] === v)); },
  };
}

test("cross-tenant channel binding is blocked", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  const base = { bindingId: "binding-1", tenantId: "tenant-1", workspaceId: "workspace-1", provider: "meta_whatsapp", channelId: "5548912345678", credentialRef: "secret://zuni/binding-1" };
  await store.upsert(base);
  await assert.rejects(() => store.get({ bindingId: "binding-1", tenantId: "tenant-2", workspaceId: "workspace-1" }), /boundary mismatch/);
  await assert.rejects(() => store.upsert({ ...base, tenantId: "tenant-2" }), /boundary mismatch/);
});
