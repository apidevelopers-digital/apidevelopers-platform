import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

function memoryRepo() {
  const rows = new Map();
  return {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list() { return [...rows.values()]; },
  };
}

test("channel binding get alone", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await store.upsert({bindingId:"test-1",tenantId:"t1",workspaceId:"w1",provider:"meta_whatsapp",channelId:"wa1",credentialRef:"ref-1"});
  const row = await store.get({bindingId:"test-1",tenantId:"t1",workspaceId:"w1"});
  assert.equal(row.channelId,"wa1");
});
