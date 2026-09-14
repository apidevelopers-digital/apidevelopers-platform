import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

test("list accepts same-scope row and fails closed on cross-tenant row", async () => {
  let currentRows = [{ bindingId: "b-1", tenantId: "t1", workspaceId: "w1", provider: "meta_whatsapp", channelId: "wa1", credentialRef: "ref-1", status: "active" }];
  const repository = {
    async getById() { return null; },
    async upsert(row) { return row; },
    async list() { return currentRows; },
  };
  const store = createSaasChannelBindingStore({ repository });
  const okRows = await store.list("t1", "w1");
  assert.equal(okRows.length, 1);
  currentRows = [{ ...currentRows[0], tenantId: "t2" }];
  await assert.rejects(() => store.list("t1", "w1"), /boundary mismatch/);
});
