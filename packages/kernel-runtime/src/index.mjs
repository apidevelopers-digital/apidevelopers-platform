const SECRET_KEY = /(^|[_-])(password|passwd|secret|token|api[_-]?key|authorization|private[_-]?key|database[_-]?url|bearer)($|[_-])/i;
function clone(v){ return v == null ? v : structuredClone(v); }
function redact(v){
  if (Array.isArray(v)) return v.map(redact);
  if (!v || typeof v !== "object") return v;
  return Object.fromEntries(Object.entries(v).map(([k,val])=>[k, SECRET_KEY.test(k) ? "[REDACTED]" : redact(val)]));
}
function assertDecision(decision){
  if (!decision || decision.decisionState !== "ready-for-human-decision") throw new Error("decision is not ready");
  if (decision.gates?.constitutionalConflict) throw new Error("constitutional conflict blocks runtime");
}
function assertPlan(decision, plan){
  if (!plan?.planId || !Array.isArray(plan.steps) || plan.steps.length===0) throw new Error("valid plan is required");
  if (plan.decisionId !== decision.decisionId) throw new Error("plan decision mismatch");
  if (plan.proposalId !== decision.selectedProposalId) throw new Error("plan proposal mismatch");
}
function assertApproval(decision, plan, approval, now){
  if (!approval) throw new Error("approval artifact is required");
  if (approval.decisionId !== decision.decisionId || approval.proposalId !== plan.proposalId) throw new Error("approval mismatch");
  if (approval.status !== "approved") throw new Error("approval is not approved");
  if (!approval.approvedBy) throw new Error("approval actor is required");
  if (approval.expiresAt && new Date(approval.expiresAt).getTime() <= new Date(now).getTime()) throw new Error("approval expired");
}
export function createRuntimeEngine({ actions = {}, clock = () => new Date().toISOString() } = {}) {
  const catalog = new Map(Object.entries(actions).map(([name, entry]) => [
    name,
    typeof entry === "function" ? { handler: entry, risk: "R1", reversible: false } : { risk:"R1", reversible:false, ...entry },
  ]));
  return Object.freeze({
    describeActions(){
      return [...catalog.entries()].sort(([a],[b])=>a.localeCompare(b)).map(([name,meta])=>({name,risk:meta.risk,reversible:Boolean(meta.reversible)}));
    },
    async run(decision, plan, options = {}){
      assertDecision(decision); assertPlan(decision, plan);
      const dryRun = options.dryRun !== false;
      const startedAt = clock();
      const unknown = plan.steps.filter(step=>!catalog.has(step.action)).map(step=>step.action);
      if (unknown.length) throw new Error(`unknown actions: ${unknown.join(", ")}`);
      if (!dryRun) {
        assertApproval(decision, plan, options.approval, startedAt);
        if (options.confirmation !== "EXECUTE_APPROVED_PLAN") throw new Error("explicit execution confirmation is required");
      }
      const steps = [];
      for (const step of plan.steps) {
        const meta = catalog.get(step.action);
        const item = { stepId:String(step.stepId), action:step.action, input:redact(clone(step.input ?? {})), risk:meta.risk, reversible:Boolean(meta.reversible) };
        if (dryRun) {
          steps.push({ ...item, status:"previewed", output:null });
          continue;
        }
        try {
          const output = await meta.handler(clone(step.input ?? {}), Object.freeze({ tenantId:options.tenantId ?? null, requestId:options.requestId ?? null, correlationId:options.correlationId ?? null }));
          steps.push({ ...item, status:"executed", output:redact(clone(output)) });
        } catch (error) {
          steps.push({ ...item, status:"failed", error:String(error?.message ?? error) });
          if (options.continueOnError !== true) break;
        }
      }
      const endedAt = clock();
      const state = dryRun ? "previewed" : steps.some(step=>step.status==="failed") ? "failed" : "executed";
      const reportId = `runtime.${plan.planId}.${startedAt}`;
      const report = {
        reportId, planId:plan.planId, decisionId:decision.decisionId, proposalId:plan.proposalId,
        tenantId:options.tenantId ?? null, requestId:options.requestId ?? null, correlationId:options.correlationId ?? null,
        dryRun, state, startedAt, endedAt, steps,
      };
      return {
        ...report,
        evidence:[{
          evidenceId:`evidence.${reportId}`,
          tenantId:String(options.tenantId ?? "tenant_unset"),
          type:"runtime-report",
          source:{module:"@apidevelopers/kernel-runtime",reportId},
          payload:redact(report),
          correlationId:options.correlationId ?? null,
        }],
      };
    },
  });
}
