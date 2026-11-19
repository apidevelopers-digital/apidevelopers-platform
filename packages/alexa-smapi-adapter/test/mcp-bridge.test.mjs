import test from "node:test";
import assert from "node:assert/strict";
import { createAlexaMcpBridge } from "../src/mcp-bridge.mjs";

test("exposes only two R1 read tools", () => {
  const bridge = createAlexaMcpBridge({ listSkills: async () => [], getManifest: async () => ({}) });
  assert.deepEqual(bridge.tools.map((t) => [t.name, t.risk, t.mode]), [
    ["alexa.skills.list", "R1", "read"],
    ["alexa.skills.manifest", "R1", "read"],
  ]);
});
test("routes only whitelisted requests to the SMAPI reader", async () => {
  const calls = [];
  const bridge = createAlexaMcpBridge({
    listSkills: async (input) => { calls.push(["list", input]); return { skills: [] }; },
    getManifest: async (input) => { calls.push(["manifest", input]); return { manifest: {} }; },
  });
  await bridge.call("alexa.skills.list", { vendorId: "ID" });
  await bridge.call("alexa.skills.manifest", { skillId: "skill", stage: "development" });
  assert.deepEqual(calls.map((c) => c[0]), ["list", "manifest"]);
  await assert.rejects(bridge.call("alexa.skills.delete", {}), /alexa_tool_not_supported/);
  await assert.rejects(bridge.call("alexa.skills.list", { vendorId: "ID", accessToken: "token" }), /invalid_tool_input/);
});
test("refuses invalid inputs or reader dependencies", async () => {
  assert.throws(() => createAlexaMcpBridge({ listSkills() {} }), /SMAPI reader required/);
  const bridge = createAlexaMcpBridge({ listSkills: async () => [], getManifest: async () => ({}) });
  await assert.rejects(bridge.call("alexa.skills.list", null), /invalid_tool_input/);
});
