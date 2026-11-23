import test from "node:test";
import assert from "node:assert/strict";

import {
  pluginCapabilities,
  pluginHealth,
  routePluginCall,
  validatePluginCall,
} from "../src/plugin-gateway.mjs";

test("plugin health returns draft readiness for known macroplugin", () => {
  const result = pluginHealth("infra");
  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.plugin, "infra");
});

test("plugin capabilities list allowed infra operations", () => {
  const result = pluginCapabilities("infra");
  assert.equal(result.status, 200);
  assert.ok(result.payload.operations.includes("operator.status"));
});

test("validatePluginCall rejects unknown operation", () => {
  const result = validatePluginCall({ pluginId: "infra", operation: "unknown.operation" });
  assert.equal(result.ok, false);
  assert.equal(result.status, 400);
  assert.equal(result.error, "operation_not_allowed_for_plugin");
});

test("real write-like operation requires confirmation", () => {
  const result = validatePluginCall({
    pluginId: "media",
    operation: "reels.render.from_package",
    dryRun: false,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.equal(result.error, "confirmation_required");
});

test("routePluginCall returns safe infra status for initial infra adapter", async () => {
  const result = await routePluginCall({
    pluginId: "infra",
    operation: "operator.status",
    dryRun: true,
  });
  assert.equal(result.status, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.plugin, "infra");
  assert.equal(result.payload.status, "gateway_online");
  assert.equal(result.payload.service, "api-gateway");
});

test("routePluginCall returns not implemented until non-infra adapter is connected", async () => {
  const result = await routePluginCall({
    pluginId: "juri",
    operation: "peterle.documents.search",
    dryRun: true,
    payload: { query: "contrato" },
  });
  assert.equal(result.status, 501);
  assert.equal(result.payload.error, "plugin_adapter_not_implemented");
  assert.equal(result.payload.acceptedByContract, true);
});
