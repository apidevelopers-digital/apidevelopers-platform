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

test("channel binding metadata rejects raw secret material", async () => {
  const store = createSaasChannelBindingStore({ repository: memoryRepo() });
  await assert.rejects(() => store.upsert({bindingId:"secret-1",tenantId:"t1",workspaceId:"w1",provider:"meta_whatsapp",channelId:"ch-1",credentialRef:"ref-1",metadata:{accessToken:"MUST_NOT_PAAS"}}), /must not contain accessToken/);
});
