import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

function memoryRepo() {
  const rows = new Map();
  return {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list({ where = {} } = {}) { return [...rows.values()].filter((row) => Object.entries(where).every(([k, v]) => row[k] === v)); },
  };
}

test("channel binding list alone", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await store.upsert({bindingId:"test-1",tenantId:"t1",workspaceId:"w1",provider:"meta_whatsapp",channelId:"wa1",credentialRef:"ref-1",status:"active"});
  const rows = await store.list("t1","w1",{provider:"meta_whatsapp",status:"active"});
  assert.equal(rows.length,1);
  assert.equal(rows[0].channelId,"wa1");
});
