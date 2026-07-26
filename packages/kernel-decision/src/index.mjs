import { assertPlanningReportContract, assertDecisionReportContract } from "@apidevelopers/contracts";

const PRIORITY = new Map([["critical",0],["high",1],["medium",2],["low",3],["info",4]]);
const clone = (v) => v == null ? v : structuredClone(v);
function freeze(v){ if(!v || typeof v!=="object" || Object.isFrozen(v)) return v; Object.freeze(v); for(const c of Object.values(v)) freeze(c); return v; }
function str(v,n){ if(typeof v!=="string" || !v.trim()) throw new TypeError(`${n} must be a non-empty string`); }
function usableEvidence(items=[]){ return new Set(items.filter(Boolean).filter(i=>typeof i==="string" || (typeof i==="object" && i.status!=="expired")).map(i=>typeof i==="string"?i:i.id).filter(Boolean)); }
function approvedReviews(items=[]){ return new Set(items.filter(i=>i && typeof i==="object" && i.status==="approved").map(i=>i.role).filter(Boolean)); }

export class DecisionEngine {
  constructor({clock=()=>new Date().toISOString()}={}){ if(typeof clock!=="function") throw new TypeError("clock must be a function"); this.clock=clock; }

  decide({tenantId,cycleId,planningReport}={}, {evidence=[],reviews=[],requestedBy="system"}={}){
    str(tenantId,"tenantId");
    str(cycleId,"cycleId");
    str(requestedBy,"requestedBy");
    assertPlanningReportContract(planningReport);

    if(planningReport.tenantId && planningReport.tenantId!==tenantId) throw new Error("cross-tenant decision blocked");
    if(planningReport.cycleId && planningReport.cycleId!==cycleId) throw new Error("cross-cycle decision blocked");

    const before=clone(planningReport);
    const ev=usableEvidence(evidence);
    const rv=approvedReviews(reviews);

    const candidates=(planningReport.proposals??[]).map((p)=>{
      const missingEvidence=(p.requiredEvidence??[]).filter(x=>!ev.has(x));
      const missingReviews=(p.requiredReviews??[]).filter(x=>!rv.has(x));
      let decisionState="ready-for-human-decision";

      if(p.constitutionalConflict===true || p.decisionState==="blocked") decisionState="blocked";
      else if(missingEvidence.length) decisionState="needs-evidence";
      else if(missingReviews.length) decisionState="needs-review";

      return {
        ...clone(p),
        missingEvidence:[...missingEvidence].sort(),
        missingReviews:[...missingReviews].sort(),
        decisionState,
        eligible:decisionState==="ready-for-human-decision",
      };
    }).sort((a,b)=>
      (PRIORITY.get(a.priority)??99)-(PRIORITY.get(b.priority)??99) ||
      a.proposalId.localeCompare(b.proposalId)
    );

    const selected=candidates.find(c=>c.eligible)??null;
    const generatedAt=this.clock();
    str(generatedAt,"generatedAt");

    const report=freeze({
      decisionId:`decision.${generatedAt.replace(/[-:.TZ]/g,"").toLowerCase()}`,
      generatedAt,
      requestedBy,
      tenantId,
      cycleId,
      sourcePlanningId:planningReport.planningId,
      mode:"advisory",
      selectedProposalId:selected?.proposalId??null,
      decisionState:selected
        ?"ready-for-human-decision"
        :(candidates.some(c=>c.decisionState==="needs-evidence")
          ?"needs-evidence"
          :candidates.some(c=>c.decisionState==="needs-review")
            ?"needs-review"
            :"blocked"),
      recommendation:selected
        ?`Recommend proposal ${selected.proposalId} for explicit human decision.`
        :"No proposal is ready for explicit human decision.",
      candidates,
      gates:{
        evidenceSatisfied:selected ? selected.missingEvidence.length===0 : false,
        reviewsSatisfied:selected ? selected.missingReviews.length===0 : false,
        constitutionalConflictFree:selected ? selected.constitutionalConflict!==true : false,
      },
      approved:false,
      humanApprovalRequired:true,
      humanDecisionRequired:true,
      mutationAlowed:false,
      executionAllowed:false,
      constraints:{
        automaticDecisionAllowed:false,
        automaticApprovalAllowed:false,
        automaticExecutionAllowed:false,
        tenantIsolationRequired:true,
        traceabilityRequired:true,
      },
    });

    if(JSON.stringify(before)!==JSON.stringify(planningReport)) throw new Error("planningReport input was mutated");
    assertDecisionReportContract(report);
    return report;
  }
}

export function createDecisionEngine(options={}){ return new DecisionEngine(options); }
