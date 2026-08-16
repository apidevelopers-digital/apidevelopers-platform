import assert from "node:assert/strict";
import test from "node:test";
import { assertProductAgentBinding } from "../src/product-agent-policy.mjs";

test("allows uni.co agent for uni.co product", () => {
  assert.doesNotThrow(() =>
    assertProductAgentBinding({
      productId: "product:uni-co",
      agentId: "uni.co",
    })
  );
});

test("blocks nexus on uni.co product", () => {
  assert.throws(
    () =>
      assertProductAgentBinding({productId: "product:uni-co", agentId: "nexus"}),
    (error) => error.code === "product_agent_mismatch" && error.status === 403,
  );
});
