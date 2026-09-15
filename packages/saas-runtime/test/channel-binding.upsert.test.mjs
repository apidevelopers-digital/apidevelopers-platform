import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

test("channel binding upsert alone", async () => {
  const rows = new Map();
  const repository = {
    async getById(id) { return rows.get(id) ?? null; },
    async upsert(row) { rows.set(row.bindingId, row); return row; },
    async list() { return [...rows.values()]; },
  };
  const store = createSaasChannelBindingStore({ repository });
  try {
    const row = await store.upsert({ bindingId: "binding-1", tenantId: "tenant-1", workspaceId: "workspace-1", provider: "meta_whatsapp", channelId: "channel-1", credentialRef: "ref-1" });
    assert.equal(row.bindingId, "binding-1");
  } catch (error) {
    throw new Error(`UPSERT_PHASE_FAILED: ${error.name}: ${error.message}`);
  }
});
