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

test("basic channel binding store behavior", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  const base = { bindingId: "binding-1", tenantId: "tenant-1", workspaceId: "workspace-1", provider: "meta_whatsapp", channelId: "5548912345678", credentialRef: "secret://zuni/binding-1" };
  await store.upsert(base);
  assert.equal((await store.get({ bindingId: "binding-1", tenantId: "tenant-1", workspaceId: "workspace-1" })).channelId, base.channelId);
  assert.equal((await store.list("tenant-1", "workspace-1", { provider: "meta_whatsapp", status: "active" })).length, 1);
});
