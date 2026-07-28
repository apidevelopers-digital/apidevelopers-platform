import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
} from "../src/global-trust-integrity-backfill-confirmation.mjs";
import { createOperationalGateway } from "../src/operational-composition.mjs";

const AUDIT = "global_trust_audit_events";

function request(apiKey, method, url, confirmation) {
  return {
    method,
    url,
    headers: {
      "x-api-key": apiKey,
      ...(confirmation ? { "x-operation-confirmation": confirmation } : {}),
    },
  };
}

test("previews safely and applies an explicitly approved integrity backfill", async () => {
  const directory = await mkdtemp(join(tmpdir(), "integrity-backfill-http-"));
  const stateFilePath = join(directory, "state.json");
  try {
    const proofIds = ["proof_legacy"];
    const gateway = createOperationalGateway({
      stateFilePath,
      adminKey: "admin-secret",
      adminPrincipal: {
        id: "actor_001",
        tenantId: "tenant_001",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
      integrityIdFactory: () => proofIds.shift(),
      integrityNow: () => "2026-07-28T12:00:00.000Z",
      integrityBackfillNow: () => "2026-07-28T12:00:01.000Z",
    });

    await gateway.store.transaction((tx) => {
      tx.put(AUDIT, "event_legacy", {
        tenantId: "tenant_001",
        occurredAt: "2026-07-28T10:00:00.000Z",
        outcome: "success",
        sensitiveContentIncluded: false,
      });
      tx.put(AUDIT, "event_other", {
        tenantId: "tenant_other",
        occurredAt: "2026-07-28T09:00:00.000Z",
        outcome: "success",
        sensitiveContentIncluded: false,
      });
    });

    const previewResponse = await gateway.app.handleRequest(
      request(
        "admin-secret",
        "GET",
        "/v1/global-trust/integrity/backfill",
      ),
    );
    assert.equal(previewResponse.status, 200);
    const preview = JSON.parse(previewResponse.body);
    assert.equal(preview.mode, "dry_run");
    assert.equal(preview.tenantId, "tenant_001");
    assert.equal(preview.plan.ready, true);
    assert.equal(preview.plan.missingProofCount, 1);
    assert.equal(preview.plan.protectedRecordCount, 1);
    assert.equal(JSON.stringify(preview).includes("event_other"), false);

    const blockedResponse = await gateway.app.handleRequest(
      request(
        "admin-secret",
        "POST",
        "/v1/global-trust/integrity/backfill",
      ),
    );
    assert.equal(blockedResponse.status, 428);
    const blocked = JSON.parse(blockedResponse.body);
    assert.equal(blocked.error, "explicit_confirmation_required");

    const applyResponse = await gateway.app.handleRequest(
      request(
        "admin-secret",
        "POST",
        "/v1/global-trust/integrity/backfill",
        GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
      ),
    );
    assert.equal(applyResponse.status, 200);
    const applied = JSON.parse(applyResponse.body);
    assert.equal(applied.mode, "executed");
    assert.equal(applied.execution.appliedProofCount, 1);
    assert.equal(applied.execution.valid, true);
    assert.equal(applied.execution.sensitiveContentIncluded, false);

    const integrityResponse = await gateway.app.handleRequest(
      request("admin-secret", "GET", "/v1/global-trust/integrity"),
    );
    assert.equal(integrityResponse.status, 200);
    const integrityBody = JSON.parse(integrityResponse.body);
    assert.equal(integrityBody.verification.valid, true);
    assert.equal(integrityBody.verification.proofCount, 1);
    assert.equal(JSON.stringify(integrityBody).includes("admin-secret"), false);

    const repeatedResponse = await gateway.app.handleRequest(
      request(
        "admin-secret",
        "POST",
        "/v1/global-trust/integrity/backfill",
        GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
      ),
    );
    assert.equal(repeatedResponse.status, 200);
    const repeated = JSON.parse(repeatedResponse.body);
    assert.equal(repeated.execution.appliedProofCount, 0);
    assert.equal(repeated.execution.valid, true);

    const otherTenantGateway = createOperationalGateway({
      stateFilePath,
      adminKey: "other-secret",
      adminPrincipal: {
        id: "actor_other",
        tenantId: "tenant_other",
        kind: "human",
        scopes: ["audit:read", "audit:write"],
      },
    });
    const otherPreviewResponse = await otherTenantGateway.app.handleRequest(
      request("other-secret", "GET", "/v1/global-trust/integrity/backfill"),
    );
    assert.equal(otherPreviewResponse.status, 200);
    const otherPreview = JSON.parse(otherPreviewResponse.body);
    assert.equal(otherPreview.plan.missingProofCount, 1);
    assert.equal(otherPreview.plan.protectedRecordCount, 1);
    assert.equal(JSON.stringify(otherPreview).includes("tenant_001"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("requires audit:write before an approved backfill can execute", async () => {
  const directory = await mkdtemp(join(tmpdir(), "integrity-backfill-http-deny-"));
  try {
    const gateway = createOperationalGateway({
      stateFilePath: join(directory, "state.json"),
      adminKey: "read-only-secret",
      adminPrincipal: {
        id: "actor_read_only",
        tenantId: "tenant_read_only",
        kind: "human",
        scopes: ["audit:read"],
      },
    });

    const response = await gateway.app.handleRequest(
      request(
        "read-only-secret",
        "POST",
        "/v1/global-trust/integrity/backfill",
        GLOBAL_TRUST_INTEGRITY_BACKFILL_CONFIRMATION,
      ),
    );
    assert.equal(response.status, 403);
    const body = JSON.parse(response.body);
    assert.equal(body.error, "forbidden");
    assert.equal(body.authorizationDecision.effect, "deny");
    assert.deepEqual(body.authorizationDecision.reasonCodes, [
      "missing_scope:audit:write",
    ]);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
