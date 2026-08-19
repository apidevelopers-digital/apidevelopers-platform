import assert from "node:assert/strict";
import test from "node:test";

import {
  bindWebAgentSurfaceRequest,
  resolveWebAgentSurface,
} from "../src/web-agent-surface-policy.mjs";

test("uni.co preview is an explicit alias of the uni.co product only", () => {
  assert.deepEqual(
    resolveWebAgentSurface("unico-preview.apidevelopers.digital"),
    {
      host: "unico-preview.apidevelopers.digital",
      productId: "product:uni-co",
      agentId: "uni.co",
    },
  );

  const bound = bindWebAgentSurfaceRequest({
    headers: { host: "unico-preview.apidevelopers.digital" },
    body: { parts: [{ type: "text", text: "preview" }] },
  });

  assert.equal(bound.body.productId, "product:uni-co");
  assert.equal(bound.body.agentId, "uni.co");
});

test("uni.co preview rejects NEXUS and arbitrary product/agent overrides", () => {
  assert.throws(
    () =>
      bindWebAgentSurfaceRequest({
        headers: { host: "unico-preview.apidevelopers.digital" },
        body: { productId: "product:nexus", agentId: "nexus" },
      }),
    /product_surface_agent_mismatch/,
  );

  assert.equal(resolveWebAgentSurface("unknown-preview.apidevelopers.digital"), null);
});
