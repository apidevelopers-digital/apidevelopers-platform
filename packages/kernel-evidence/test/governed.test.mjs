import test from "node:test";
import assert from "node:assert/strict";
import {
  createEvidenceRegistry,
  verifyEvidence,
} from "../src/index.mjs";
import {
  recordGovernedRuntimeEvidence,
  createGovernedEvidenceAuditHandoff,
} from "../src/governed.mjs";
import {
  createTenantContext,
  createRuntimeEvidenceHandoff,
  assertEvidenceAuditHandoffContract,
} from "@apidevelopers/contracts";

const NOW = "2026-07-26T05:00:00.000Z";
const tenantContext = createTenantContext({
  tenantId: "tenant_alpha",
  principalId: "human.1",
  requestId: "request.1",
  roles: ["operator"],
  permissions: ["evidence:record", "audit:read"],
  createdAt: NOW,
});

const runtimeReport = {
  reportId: "runtime.1",
  planId: "plan.1",
  decisionId: "decision.1",
  proposalId: "proposal.1",
  tenantId: "tenant_alpha",
  cycleId: "cycle_1",
  sourceHandoffId: "handoff.policy-runtime.1",
  policyDecisionId: "policy.1",
  requestedMode: "preview",
  state: "previewed",
  startedAt: NOW,
  endedAt: NOW,
  dryRun: true,
  executionAuthorized: false,
  executionObserved: false,
  mutationObserved: false,
  approvalId: null,
  steps: [{ stepId: "step.1", status: "previewed" }],
  evidence: ["runtime.preview.1"],
  constraints: {
    policyGateRequired: true,
    explicitConfirmationRequired: true,
    tenantIsolationRequired: true,
    evidenceRequired: true,
    automaticExecutionAllowed: false,
  },
};

test("records runtime evidence from the canonical handoff", () => {
  const handoff = createRuntimeEvidenceHandoff({
    handoffId: "handoff.runtime-evidence.1",
    cycleId: "cycle_1",
    tenantContext,
    runtimeReport,
    createdAt: NOW,
  });
  const registry = createEvidenceRegistry({ clock: () => NOW });
  const record = recordGovernedRuntimeEvidence({ handoff, registry });
  assert.equal(record.tenantId, "tenant_alpha");
  assert.equal(record.cycleId, "cycle_1");
  assert.equal(record.source.policyDecisionId, "policy.1");
  assert.equal(record.payload.runtimeReport.reportId, "runtime.1");
  assert.equal(verifyEvidence(record), true);
});

test("creates the canonical evidence to audit handoff", () => {
  const runtimeHandoff = createRuntimeEvidenceHandoff({
    handoffId: "handoff.runtime-evidence.1",
    cycleId: "cycle_1",
    tenantContext,
    runtimeReport,
    createdAt: NOW,
  });
  const evidenceRecord = recordGovernedRuntimeEvidence({
    handoff: runtimeHandoff,
    registry: createEvidenceRegistry({ clock: () => NOW }),
  });
  const lifecycle = {
    decision: { decisionId: "decision.1", selectedProposalId: "proposal.1" },
    plan: {
      planId: "plan.1",
      decisionId: "decision.1",
      proposalId: "proposal.1",
      planHash: "a".repeat(64),
    },
    policyDecision: {
      policyDecisionId: "policy.1",
      planHash: "a".repeat(64),
    },
    approval: null,
  };
  const auditHandoff = createGovernedEvidenceAuditHandoff({
    handoffId: "handoff.evidence-audit.1",
    cycleId: "cycle_1",
    tenantContext,
    evidenceRecord,
    lifecycle,
    createdAt: NOW,
  });
  assertEvidenceAuditHandoffContract(auditHandoff);
  assert.equal(auditHandoff.from, "kernel-evidence");
  assert.equal(auditHandoff.to, "kernel-audit");
  assert.equal(auditHandoff.executionAllowed, false);
});
