export const RISK = Object.freeze({
  R1: "R1_READONLY",
  R2: "R2_DRY_RUN",
  R3: "R3_APPROVAL_REQUIRED"
});

export const APPROVAL = Object.freeze({
  NONE: "none",
  DRY_RUN_FIRST: "dry_run_first",
  IGOR_EXPLICIT: "igor_explicit"
});

export const SAFETY = Object.freeze({
  secretsNeverReturned: true,
  dryRunBeforeWrite: true,
  productionMutationRequiresApproval: true,
  providerActionsStayBehindGateway: true
});

export function approvalForRisk(risk) {
  if (risk === RISK.R1) return APPROVAL.NONE;
  if (risk === RISK.R2) return APPROVAL.DRY_RUN_FIRST;
  return APPROVAL.IGOR_EXPLICIT;
}

export function assertAutonomousAllowed(tool) {
  if (tool?.risk === RISK.R3) {
    const err = new Error("ADA approval required before execution");
    err.code = "ADA_APPROVAL_REQUIRED";
    throw err;
  }
  return true;
}
