import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

test("channel binding list calls canonical repository contract", async () => {
  const rows = new Map();
  let capturedListArgument;
  const repository = {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list(arg) { capturedListArgument = arg; return [...rows.values()]; },
  };
  const store = createSaasChannelBindingStore({ repository });
  await store.upsert({bindingId:"test-1",tenantId:"t1",workspaceId:"w1",provider:"meta_whatsapp",channelId:"wa1",credentialRef:"ref-1",status:"active"});
  const result = await store.list("t1","w1",{provider:"meta_whatsapp", status:"active"});
  assert.deepEqual(capturedListArgument,{where:{tenantId:"t1",workspaceId:"w1",provider:"meta_whatsapp",status:"active"}});
  assert.equal(result.length,1);
  assert.equal(result[0].channelId,"wa1");
});
