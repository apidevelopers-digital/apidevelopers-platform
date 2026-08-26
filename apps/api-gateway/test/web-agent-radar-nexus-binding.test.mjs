import assert from "node:assert/strict";
import test from "node:test";

import {
  assertProductAgentBinding,
  resolveAllowedAgents,
} from "../src/product-agent-policy.mjs";
import {
  bindWebAgentSurfaceRequest,
  resolveWebAgentSurface,
} from "../src/web-agent-surface-policy.mjs";

const RADAR_PRODUCT_ID = "product:radar";
const NEXUS_AGENT_ID = "nexus";
const RADAR_HOSTS = Object.freeze([
  "radar.apidevelopers.digital",
  "radar-preview.apidevelopers.digital",
]);

test("Radar product is authorized to use the Nexus agent", () => {
  assert.deepEqual(resolveAllowedAgents(RADAR_PRODUCT_ID), [NEXUS_AGENT_ID]);
  assert.deepEqual(
    assertProductAgentBinding({
      productId: RADAR_PRODUCT_ID,
      agentId: NEXUS_AGENT_ID,
    }),
    {
      allowed: true,
      productId: RADAR_PRODUCT_ID,
      agentId: NEXUS_AGENT_ID,
    },
  );

  assert.throws(
    () =>
      assertProductAgentBinding({
        productId: RADAR_PRODUCT_ID,
        agentId: "uni.co",
      }),
    (error) =>
      error?.code === "product_agent_mismatch" &&
      error?.status === 403,
  );
});

for (const host of RADAR_HOSTS) {
  test(`${host} binds Radar to Nexus without trusting body identity`, () => {
    assert.deepEqual(resolveWebAgentSurface(host), {
      host,
      productId: RADAR_PRODUCT_ID,
      agentId: NEXUS_AGENT_ID,
    });

    const bound = bindWebAgentSurfaceRequest({
      headers: { host },
      body: {
        parts: [{ type: "text", text: "status" }],
      },
    });

    assert.equal(bound.surface.host, host);
    assert.equal(bound.body.productId, RADAR_PRODUCT_ID);
    assert.equal(bound.body.agentId, NEXUS_AGENT_ID);

    assert.throws(
      () =>
        bindWebAgentSurfaceRequest({
          headers: { host },
          body: {
            productId: "product:nexus",
            agentId: NEXUS_AGENT_ID,
          },
        }),
      (error) =>
        error?.code === "product_surface_agent_mismatch" &&
        error?.status === 403,
    );
  });
}
