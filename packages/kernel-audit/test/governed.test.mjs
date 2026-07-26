import test from "node:test";
import assert from "node:assert/strict";

import {
  assertGovernedAuditReportContract,
  createRuntimeEvidenceHandoff,
  createTenantContext,
} from "@apidevelopers/contracts";
import {
  createEvidenceRegistry,
} from "@apidevelopers/kernel-evidence";
import {
  createGovernedEvidenceAuditHandoff,
  recordGovernedRuntimeEvidence,
} from "@apidevelopers/kernel-evidence/governed";
import { runGovernedAudit } from "../src/governed.mjs";
import { createAuditEngine } from "../src/index.mjs";

const NOW = "2026-07-26T06:00:00.000Z";
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

function buildHandoff() {
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
    decision: {
      decisionId: "decision.1",
      selectedProposalId: "proposal.1",
      decisionState: "ready-for-human-decision",
      humanApprovalRequired: true,
      approved: false,
      mutationAllowed: false,
      executionAllowed: false,
      constraints: {
        automaticDecisionAllowed: false,
        automaticApprovalAllowed: false,
        automaticExecutionAllowed: false,
      },
    },
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
  return createGovernedEvidenceAuditHandoff({
    handoffId: "handoff.evidence-audit.1",
    cycleId: "cycle_1",
    tenantContext,
    evidenceRecord,
    lifecycle,
    createdAt: NOW,
  });
}

test("runs the canonical evidence to audit handoff", () => {
  const report = runGovernedAudit({
    handoff: buildHandoff(),
    engine: createAuditEngine({
      clock: () => NOW,
      verifyEvidence: () => true,
    }),
    requestedBy: "human.1",
    scope: "preview",
  });

  assertGovernedAuditReportContract(report);
  assert.equal(report.status, "compliant");
  assert.equal(report.tenantId, "tenant_alpha");
  assert.equal(report.cycleId, "cycle_1");
  assert.equal(report.sourceHandoffId, "handoff.evidence-audit.1");
  assert.equal(report.sourceEvidenceId, "evidence.runtime.1");
  assert.equal(report.evidenceVerified, true);
  assert.equal(report.mutationAllowed, false);
  assert.equal(report.executionAllowed, false);
  assert.equal(Object.isFrozen(report), true);
  assert.equal(Object.isFrozen(report.checks), true);
});

test("rejects a tampered source evidence record", () => {
  const handoff = buildHandoff();
  const tampered = structuredClone(handoff);
  tampered.payload.evidenceRecord.payload.runtimeReport.state = "executed";

  assert.throws(
    () => runGovernedAudit({ handoff: tampered }),
    /contract|integrity|mismatch|must/i,
  );
});
