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
  assert.ok(captured && typeof captured === "object", "LIST_ARG_MISSING");
  assert.ok(captured.where && typeof captured.where === "object", "LIST_WHERE_MISSING");
  assert.equal(captured.where.tenantId, "t1", `LIST_TENANT_MISMATCH: ${captured.where.tenantId}`);
  assert.equal(captured.where.workspaceId, "w1", `LIST_WORKSPACE_MISMATCH: ${captured.where.workspaceId}`);
  assert.equal(captured.where.provider, "meta_whatsapp", `LIST_PROVIDER_MISMATCH: ${captured.where.provider}`);
  assert.equal(captured.where.status, "active", `LIST_STATUS_MISMATCH: ${captured.where.status}`);
  assert.deepEqual(result, [], "LIST_RESULT_MISMATCH");
});
