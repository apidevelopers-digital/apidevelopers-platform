import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildFamilyDataPostgresDiscoveryReport } from "../packages/hostinger-adapter/src/family-data-postgres-discovery.mjs";

describe("family data postgres discovery adapter", () => {
  it("returns no-go for current observed Hostinger shape without PostgreSQL", () => {
    const report = buildFamilyDataPostgresDiscoveryReport({
      vps: { status: "running", os: "Ubuntu 24.04", firewall_group_id: null },
      backups: [{ created_at: "2026-10-09T00:00:00Z" }],
      databases: [{ name: "hosted_db", port: 3306, engine: "mysql" }],
      remoteAccess: [{ host: "%" }],
      nodeBuilds: [{ branch: "deploy/hostinger-gateway-runtime", commit: "3b1e2d61" }]
    });

    assert.equal(report.mode, "read_only");
    assert.equal(report.safe_for_mcp_read_only_tool, true);
    assert.equal(report.mutates_infrastructure, false);
    assert.equal(report.reads_credentials, false);
    assert.equal(report.opens_network_connection_to_database, false);
    assert.equal(report.executes_sql, false);
    assert.equal(report.installs_packages, false);
    assert.equal(report.deploys_runtime, false);
    assert.equal(report.decision, "NO_GO_FOR_LIVE_POSTGRES_PROBE");
    assert.ok(report.blockers.includes("postgres_not_detected"));
    assert.ok(report.blockers.includes("vps_firewall_group_not_configured"));
    assert.ok(report.warnings.includes("broad_remote_database_access_present"));
  });

  it("returns go for approval package only when non-secret evidence is complete", () => {
    const report = buildFamilyDataPostgresDiscoveryReport({
      vps: { status: "running", os: "Ubuntu 24.04", firewall_group_id: "private-fw" },
      backups: [{ created_at: "2026-10-09T00:00:00Z" }],
      databases: [{ name: "family_data", port: 5432, engine: "PostgreSQL" }],
      remoteAccess: [{ host: "10.0.0.5" }],
      nodeBuilds: [{ branch: "main", commit: "2a97c52" }]
    });

    assert.equal(report.decision, "GO_FOR_APPROVAL_PACKAGE");
    assert.deepEqual(report.blockers, []);
    assert.equal(report.databases.postgres_evidence_present, true);
    assert.equal(report.remote_access.broad_remote_access_present, false);
    assert.equal(report.node_builds.main_branch_seen, true);
  });

  it("does not echo credential-like input values", () => {
    const report = buildFamilyDataPostgresDiscoveryReport({
      databases: [{ name: "family_data", port: 5432, password: "secret", connection_string: "postgres://user:password@host/db" }]
    });

    const serialized = JSON.stringify(report);
    assert.equal(serialized.includes("secret"), false);
    assert.equal(serialized.includes("postgres://"), false);
  });
});
