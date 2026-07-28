import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION,
  createGlobalTrustKillSwitchService,
} from "../src/global-trust-kill-switch.mjs";
import { createGlobalTrustIntegrityService } from "../src/global-trust-integrity.mjs";

test("persists an immutable tenant kill switch history and verifies integrity", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-kill-switch-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const proofIds = ["proof_001", "proof_002"];
    const eventIds = ["switch_001", "switch_002"];
    let currentTime = "2026-07-28T12:00:00.000Z";

    const integrity = createGlobalTrustIntegrityService({
      store,
      idFactory: () => proofIds.shift(),
      now: () => currentTime,
    });
    const service = createGlobalTrustKillSwitchService({
      store,
      integrity,
      eventIdFactory: () => eventIds.shift(),
      now: () => currentTime,
    });
    const identity = {
      principal: {
        id: "operator_001",
        tenantId: "tenant_001",
        kind: "human",
      },
    };

    const initial = await service.getTenant({ tenantId: "tenant_001" });
    assert.equal(initial.enabled, false);
    assert.equal(initial.version, 0);
    assert.equal(initial.reasonCode, "not_configured");

    const enabled = await service.setTenant({
      tenantId: "tenant_001",
      identity,
      enabled: true,
      reasonCode: "incident_containment",
      correlationId: "corr_enable",
    });
    assert.equal(enabled.enabled, true);
    assert.equal(enabled.version, 1);
    assert.equal(enabled.changed, true);
    assert.equal(enabled.killSwitchEventId, "switch_001");
    assert.equal(enabled.sensitiveContentIncluded, false);

    const repeated = await service.setTenant({
      tenantId: "tenant_001",
      identity,
      enabled: true,
      reasonCode: "duplicate_request",
      correlationId: "corr_duplicate",
    });
    assert.equal(repeated.enabled, true);
    assert.equal(repeated.version, 1);
    assert.equal(repeated.changed, false);
    assert.equal(repeated.killSwitchEventId, "switch_001");

    currentTime = "2026-07-28T12:01:00.000Z";
    const disabled = await service.setTenant({
      tenantId: "tenant_001",
      identity,
      enabled: false,
      reasonCode: "incident_resolved",
      correlationId: "corr_disable",
    });
    assert.equal(disabled.enabled, false);
    assert.equal(disabled.version, 2);
    assert.equal(disabled.changed, true);
    assert.equal(disabled.killSwitchEventId, "switch_002");

    const events = await store.transaction((tx) =>
      tx.list(GLOBAL_TRUST_KILL_SWITCH_EVENT_COLLECTION)
    );
    assert.equal(events.result.length, 2);
    assert.equal(events.result[0].value.previousEventId, null);
    assert.equal(events.result[1].value.previousEventId, "switch_001");
    assert.equal(JSON.stringify(events.result).includes("secret"), false);

    const verification = await integrity.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 2);
    assert.equal(verification.protectedRecordCount, 2);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires a human operator from the same tenant", async () => {
  const directory = await mkdtemp(join(tmpdir(), "global-trust-kill-switch-deny-"));
  try {
    const store = createJsonFileStore({ filePath: join(directory, "state.json") });
    const service = createGlobalTrustKillSwitchService({ store });

    await assert.rejects(
      service.setTenant({
        tenantId: "tenant_001",
        identity: {
          principal: {
            id: "service_001",
            tenantId: "tenant_001",
            kind: "service",
          },
        },
        enabled: true,
        reasonCode: "test",
        correlationId: "corr_001",
      }),
      (error) => error.code === "human_operator_required" && error.status === 403,
    );

    await assert.rejects(
      service.setTenant({
        tenantId: "tenant_001",
        identity: {
          principal: {
            id: "operator_other",
            tenantId: "tenant_other",
            kind: "human",
          },
        },
        enabled: true,
        reasonCode: "test",
        correlationId: "corr_002",
      }),
      (error) => error.code === "tenant_mismatch" && error.status === 403,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
