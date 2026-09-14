import test from "node:test";
import assert from "node:assert/strict";
import { createSaasChannelBindingStore } from "../src/channel-binding.mjs";

test("list sends canonical where to repository", async () => {
  let captured;
  const repository = {
    async getById() { return null; },
    async upsert(row) { return row; },
    async list(arg) { captured = arg; return []; },
  };
  const store = createSaasChannelBindingStore({ repository });
  const result = await store.list("t1", "w1", { provider: "meta_whatsapp", status: "active" });
  assert.deepEqual(captured, { where: { tenantId: "t1", workspaceId: "w1", provider: "meta_whatsapp", status: "active" } });
  assert.deepEqual(result, []);
});
