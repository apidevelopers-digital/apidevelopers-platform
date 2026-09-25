import assert from "node:assert/strict";
import test from "node:test";

import {
  createMitraMcpV1CapabilitiesResponse,
  createMitraMcpV1Runtime,
  createMitraMcpV1StatusResponse,
} from "../src/mitra-mcp-v1-runtime.mjs";

test("Mitra MCP v1 runtime executes status with tenant and scope", async () => {
  const runtime = createMitraMcpV1Runtime({
    clock: () => "2026-09-25T00:00:00.000Z",
  });

  const response = await runtime.executeTool({
    name: "mitra.status",
    context: {
      tenantId: "tenant_milena",
      scopes: ["mitra:status:read"],
    },
  });

  assert.deepEqual(response, {
    ok: true,
    service: "mitra-mcp",
    version: "1.0.0-draft",
    tenantId: "tenant_milena",
    timestamp: "2026-09-25T00:00:00.000Z",
  });
  assert.equal(Object.isFrozen(response), true);
});

test("Mitra MCP v1 runtime executes capabilities with scoped tenant context", async () => {
  const runtime = createMitraMcpV1Runtime({
    capabilitiesProvider: () => ["mitra.status", "mitra.capabilities"],
    limitsProvider: () => ({ dailySearches: 100 }),
  });

  const response = await runtime.executeTool({
    name: "mitra.capabilities",
    identity: {
      tenantId: "tenant_milena",
      principal: {
        scopes: ["mitra:capabilities:read"],
      },
    },
  });

  assert.equal(response.ok, true);
  assert.equal(response.tenantId, "tenant_milena");
  assert.deepEqual(response.tools, ["mitra.status", "mitra.capabilities"]);
  assert.deepEqual(response.limits, { dailySearches: 100 });
  assert.equal(response.toolDefinitions.length, 0);
  assert.equal(Object.isFrozen(response), true);
});

test("Mitra MCP v1 runtime denies missing tenant and insufficient scope without calling backends", async () => {
  const runtime = createMitraMcpV1Runtime();

  assert.deepEqual(
    await runtime.executeTool({
      name: "mitra.status",
      context: {
        scopes: ["mitra:status:read"],
      },
    }),
    {
      ok: false,
      error: "tenant_not_found",
      reason: "Mitra MCP v1 requires a tenant context before executing tools.",
      retryable: false,
      needsHumanReview: false,
    },
  );

  assert.deepEqual(
    await runtime.executeTool({
      name: "mitra.status",
      context: {
        tenantId: "tenant_milena",
        scopes: ["mitra:capabilities:read"],
      },
    }),
    {
      ok: false,
      error: "insufficient_scope",
      reason: "Required scope: mitra:status:read",
      retryable: false,
      needsHumanReview: false,
    },
  );
});

test("Mitra MCP v1 runtime keeps non-wired tools fail-closed", async () => {
  const runtime = createMitraMcpV1Runtime();

  const response = await runtime.executeTool({
    name: "mitra.buscar_jurisprudencia",
    context: {
      tenantId: "tenant_milena",
      scopes: ["mitra:jurisprudencia:read"],
    },
    input: {
      query: "dano moral por negativacao indevida",
    },
  });

  assert.equal(response.ok, false);
  assert.equal(response.error, "dependency_unavailable");
  assert.match(response.reason, /registered but its backend adapter is not wired/);
  assert.equal(response.retryable, false);
  assert.equal(response.needsHumanReview, false);
});

test("Mitra MCP v1 direct response helpers are deterministic and tenant-safe", () => {
  assert.deepEqual(createMitraMcpV1StatusResponse({ tenantId: "tenant_milena", timestamp: "2026-09-25T00:00:00.000Z" }), {
    ok: true,
    service: "mitra-mcp",
    version: "1.0.0-draft",
    tenantId: "tenant_milena",
    timestamp: "2026-09-25T00:00:00.000Z",
  });

  const capabilities = createMitraMcpV1CapabilitiesResponse({ tenantId: "tenant_milena" });
  assert.equal(capabilities.ok, true);
  assert.equal(capabilities.tenantId, "tenant_milena");
  assert.equal(capabilities.tools.includes("mitra.buscar_jurisprudencia"), true);
  assert.equal(capabilities.toolDefinitions.some((item) => item.secretsReturned === true), false);

  assert.equal(createMitraMcpV1StatusResponse().error, "tenant_not_found");
  assert.equal(createMitraMcpV1CapabilitiesResponse().error, "tenant_not_found");
});
