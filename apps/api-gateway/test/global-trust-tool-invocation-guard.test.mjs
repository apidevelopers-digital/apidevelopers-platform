import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createToolInvocationPolicy } from "@apidevelopers/contracts";
import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION,
  createGlobalTrustToolInvocationGuard,
} from "../src/global-trust-tool-invocation-guard.mjs";
import { createGlobalTrustToolInvocationIntegrity } from "../src/global-trust-tool-invocation-integrity.mjs";

function sequence(prefix) {
  let value = 0;
  return () => `${prefix}_${String(++value).padStart(3, "0")}`;
}

function identity(tenantId, principalId = "service_001") {
  return {
    principal: {
      id: principalId,
      tenantId,
      kind: "service",
      scopes: ["tool:invoke"],
    },
  };
}

function proposal(overrides = {}) {
  return {
    toolId: "catalog.read",
    action: "read",
    useCase: "catalog.lookup",
    correlationId: "corr_001",
    callCount: 1,
    executionClass: "read",
    arguments: {
      productId: "product_001",
      locale: "pt-BR",
    },
    ...overrides,
  };
}

test("evaluates tenant policies without executing tools and protects decisions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tool-invocation-guard-"));

  try {
    const store = createJsonFileStore({
      filePath: join(directory, "state.json"),
    });
    const integrity = createGlobalTrustToolInvocationIntegrity({
      store,
      proofIdFactory: sequence("proof"),
      now: () => "2026-07-28T15:00:00.000Z",
    });
    const guard = createGlobalTrustToolInvocationGuard({
      store,
      integrity,
      policies: [
        createToolInvocationPolicy({
          policyId: "policy_catalog",
          tenantId: "tenant_001",
          toolId: "catalog.read",
          allowedActions: ["read"],
          deniedActions: ["delete"],
          maxCallsPerRequest: 2,
          humanApprovalRequired: false,
        }),
        createToolInvocationPolicy({
          policyId: "policy_message",
          tenantId: "tenant_001",
          toolId: "message.send",
          allowedActions: ["send"],
          deniedActions: [],
          maxCallsPerRequest: 1,
          humanApprovalRequired: true,
        }),
        createToolInvocationPolicy({
          policyId: "policy_other",
          tenantId: "tenant_other",
          toolId: "catalog.read",
          allowedActions: ["read"],
          deniedActions: [],
          maxCallsPerRequest: 1,
          humanApprovalRequired: false,
        }),
      ],
      decisionIdFactory: sequence("decision"),
      now: () => "2026-07-28T15:01:00.000Z",
    });

    const allowed = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal(),
    });
    assert.equal(allowed.outcome, "allow");
    assert.deepEqual(allowed.reasonCodes, ["policy_allow"]);
    assert.equal(allowed.automaticAdministrativeExecutionAllowed, false);
    assert.match(allowed.argumentHash, /^[a-f0-9]{64}$/);
    assert.equal(JSON.stringify(allowed).includes("product_001"), false);

    const deniedAction = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal({ action: "delete", correlationId: "corr_002" }),
    });
    assert.equal(deniedAction.outcome, "deny");
    assert.equal(deniedAction.reasonCodes.includes("action_explicitly_denied"), true);

    const deniedAdministrative = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal({
        action: "deploy",
        executionClass: "administrative",
        correlationId: "corr_003",
      }),
    });
    assert.equal(deniedAdministrative.outcome, "deny");
    assert.equal(
      deniedAdministrative.reasonCodes.includes("administrative_execution_blocked"),
      true,
    );

    const deniedArguments = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal({
        correlationId: "corr_004",
        arguments: { productId: "product_001", apiKey: "not-persisted" },
      }),
    });
    assert.equal(deniedArguments.outcome, "deny");
    assert.equal(deniedArguments.reasonCodes.includes("forbidden_argument_key"), true);
    assert.equal(JSON.stringify(deniedArguments).includes("not-persisted"), false);

    const pending = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal({
        toolId: "message.send",
        action: "send",
        useCase: "customer.notification",
        correlationId: "corr_005",
        executionClass: "write",
        arguments: {
          recipientId: "contact_001",
          templateId: "template_001",
        },
      }),
    });
    assert.equal(pending.outcome, "pending_approval");
    assert.deepEqual(pending.reasonCodes, ["human_approval_required"]);

    const otherTenant = await guard.evaluate({
      identity: identity("tenant_other", "service_other"),
      proposal: proposal({ correlationId: "corr_other" }),
    });
    assert.equal(otherTenant.outcome, "allow");

    const tenantDecisions = await guard.listTenant({ tenantId: "tenant_001" });
    assert.equal(tenantDecisions.length, 5);
    assert.equal(
      tenantDecisions.every((decision) => decision.tenantId === "tenant_001"),
      true,
    );
    assert.equal(JSON.stringify(tenantDecisions).includes("template_001"), false);

    const otherDecisions = await guard.listTenant({ tenantId: "tenant_other" });
    assert.equal(otherDecisions.length, 1);
    assert.equal(JSON.stringify(otherDecisions).includes("tenant_001"), false);

    const verification = await integrity.verifyTenant({ tenantId: "tenant_001" });
    assert.equal(verification.valid, true);
    assert.equal(verification.proofCount, 5);
    assert.equal(verification.verifiedRecordCount, 5);

    const stored = await store.transaction((tx) =>
      tx.list(GLOBAL_TRUST_TOOL_INVOCATION_DECISION_COLLECTION)
    );
    assert.equal(stored.result.length, 6);
    assert.equal(JSON.stringify(stored.result).includes("not-persisted"), false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("denies by default when no tenant policy exists", async () => {
  const directory = await mkdtemp(join(tmpdir(), "tool-invocation-default-deny-"));

  try {
    const store = createJsonFileStore({
      filePath: join(directory, "state.json"),
    });
    const integrity = createGlobalTrustToolInvocationIntegrity({
      store,
      proofIdFactory: () => "proof_default_deny",
      now: () => "2026-07-28T15:10:00.000Z",
    });
    const guard = createGlobalTrustToolInvocationGuard({
      store,
      integrity,
      policies: [],
      decisionIdFactory: () => "decision_default_deny",
      now: () => "2026-07-28T15:10:00.000Z",
    });

    const decision = await guard.evaluate({
      identity: identity("tenant_001"),
      proposal: proposal(),
    });

    assert.equal(decision.outcome, "deny");
    assert.deepEqual(decision.reasonCodes, ["policy_not_found"]);
    assert.equal(decision.policyId, null);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
