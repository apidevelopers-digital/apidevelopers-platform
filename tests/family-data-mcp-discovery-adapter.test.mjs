import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  createFamilyDataMcpDiscoveryAdapter,
  planFamilyDataMcpDiscoveryAdapter
} from "../apps/api-gateway/src/family-data-mcp-postgres-discovery-adapter.mjs";

describe("family data mcp discovery adapter", () => {
  it("plans required read-only MCP tools", () => {
    const plan = planFamilyDataMcpDiscoveryAdapter({
      availableTools: ["vps.status", "postgres.detect"]
    });

    assert.equal(plan.ready, false);
    assert.equal(plan.dry_run, true);
    assert.equal(plan.read_only, true);
    assert.equal(plan.performs_mutation, false);
    assert.equal(plan.executes_shell, false);
    assert.equal(plan.reads_credentials, false);
    assert.equal(plan.connects_to_database, false);
    assert.ok(plan.missing_tools.includes("vps.services.list"));
    assert.ok(plan.missing_tools.includes("gateway.runtime.status"));
  });

  it("collects evidence through injected tools without exposing secrets", async () => {
    const calls = [];
    const adapter = createFamilyDataMcpDiscoveryAdapter({
      async callTool(tool, args) {
        calls.push({ tool, args });

        if (tool === "vps.status") {
          return {
            present: true,
            status: "running",
            token: "do-not-return",
            connectionString: "postgres://secret"
          };
        }

        if (tool === "postgres.detect") {
          return {
            detected: true,
            version: "16",
            tls_required: true,
            private_network: true,
            password: "do-not-return"
          };
        }

        if (tool === "postgres.backup.status") {
          return { present: true, items: [{ created_at: "2026-10-11" }] };
        }

        if (tool === "gateway.runtime.status") {
          return {
            present: true,
            branch: "deploy/hostinger-gateway-runtime",
            commit: "example",
            current_source_confirmed: true
          };
        }

        return { present: true };
      }
    });

    const result = await adapter.collectEvidence();

    assert.equal(calls.length, 6);
    assert.ok(calls.every((call) => call.args.dry_run === true));
    assert.ok(calls.every((call) => call.args.mode === "read_only"));
    assert.equal(result.decision, "GO_FOR_APPROVAL_PACKAGE");
    assert.deepEqual(result.blockers, []);
    assert.equal(result.evidence.vps_status.token, undefined);
    assert.equal(result.evidence.vps_status.connectionString, undefined);
    assert.equal(result.evidence.postgres_detect.password, undefined);
    assert.equal(result.connects_to_database, false);
    assert.equal(result.executes_shell, false);
  });

  it("returns NO-GO with explicit blockers when required evidence is missing", async () => {
    const adapter = createFamilyDataMcpDiscoveryAdapter({
      async callTool(tool) {
        if (tool === "vps.status") return { present: true };
        if (tool === "gateway.runtime.status") return { present: true };
        return {};
      }
    });

    const result = await adapter.collectEvidence();

    assert.equal(result.decision, "NO_GO");
    assert.ok(result.blockers.includes("postgres_not_detected"));
    assert.ok(result.blockers.includes("postgres_tls_not_confirmed"));
    assert.ok(result.blockers.includes("postgres_private_network_not_confirmed"));
    assert.ok(result.blockers.includes("postgres_backup_not_confirmed"));
    assert.ok(result.blockers.includes("gateway_runtime_current_source_not_confirmed"));
  });

  it("requires an injected callTool function", () => {
    assert.throws(
      () => createFamilyDataMcpDiscoveryAdapter(),
      /callTool function is required/
    );
  });
});
