const PRIORITIES = Object.freeze(["critical","high","medium","low","info"]);
const RANK = new Map(PRIORITIES.map((v,i)=>[v,i]));
const copy = (v) => v == null ? v : structuredClone(v);
function freeze(v){ if(!v||typeof v!=="object"||Object.isFrozen(v)) return v; Object.freeze(v); for(const x of Object.values(v)) freeze(x); return v; }
function str(v,n){ if(typeof v!=="string"||!v.trim()) throw new TypeError(`${n} must be a non-empty string`); }
function obj(v,n){ if(!v||typeof v!=="object"||Array.isArray(v)) throw new TypeError(`${n} must be an object`); }
function safe(v){ return String(v).trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"unknown"; }
function severity(v){ return RANK.has(v)?v:"info"; }
function groups(findings){
  const map=new Map();
  findings.forEach((f,i)=>{
    obj(f,`reflectionReport.findings[${i}]`); str(f.subject,`reflectionReport.findings[${i}].subject`);
    const category=typeof f.category==="string"&&f.category.trim()?f.category.trim().toLowerCase():"general";
    const key=`${f.subject}\0${category}`;
    if(!map.has(key)) map.set(key,{subject:f.subject,category,findings:[]});
    map.get(key).findings.push(copy(f));
  });
  return [...map.values()].sort((a,b)=>a.subject.localeCompare(b.subject)||a.category.localeCompare(b.category));
}
function impactComplete(impact,subject){
  if(!impact) return false;
  if(impact.complete===true && !impact.subject) return true;
  if(impact.subject===subject && impact.complete!==false) return true;
  return Array.isArray(impact.items)&&impact.items.some((x)=>x?.subject===subject&&x.complete!==false);
}
function evidenceFor(group,reflection){
  const shared=Array.isArray(reflection.evidence)?reflection.evidence:[];
  return group.findings.flatMap((f)=>[
    ...(Array.isArray(f.evidence)?f.evidence:[]),
    ...shared.filter((x)=>!x||typeof x!=="object"||!x.subject||x.subject===f.subject)
  ]).filter(Boolean);
}
function usable(x){ return typeof x==="string"?Boolean(x.trim()):Boolean(x&&typeof x==="object"&&x.status!=="expired"); }

export class PlanningEngine{
  constructor({clock=()=>new Date().toISOString()}={}){ if(typeof clock!=="function") throw new TypeError("clock must be a function"); this.clock=clock; }
  plan({tenantId,cycleId,reflectionReport}={}, {requestedBy="system",scope="platform",objective="governed-evolution",maxProposals=20,impactAnalysis=null}={}){
    str(tenantId,"tenantId"); str(cycleId,"cycleId"); str(requestedBy,"requestedBy"); str(scope,"scope"); str(objective,"objective"); obj(reflectionReport,"reflectionReport");
    if(reflectionReport.tenantId!==tenantId) throw new Error("cross-tenant planning blocked");
    if(reflectionReport.cycleId!==cycleId) throw new Error("planning cycle mismatch");
    if(!["advisory","read-only"].includes(reflectionReport.mode)) throw new Error("reflectionReport must be advisory or read-only");
    if(!Number.isInteger(maxProposals)||maxProposals<1) throw new TypeError("maxProposals must be a positive integer");
    const findings=reflectionReport.findings??reflectionReport.conclusions;
    if(!Array.isArray(findings)) throw new TypeError("reflectionReport.findings must be an array");
    const sourceReflectionId=reflectionReport.reflectionId??reflectionReport.reasoningId??reflectionReport.id;
    str(sourceReflectionId,"reflectionReport.reflectionId");

    const proposals=groups(findings).map((g,i)=>{
      const priority=g.findings.map((f)=>severity(f.severity)).sort((a,b)=>RANK.get(a)-RANK.get(b))[0]??"info";
      const high=["critical","high"].includes(priority);
      const evidence=evidenceFor(g,reflectionReport);
      const requiredEvidence=[];
      if(!evidence.some(usable)) requiredEvidence.push(`evidence:${g.subject}`);
      const impactOk=impactComplete(impactAnalysis,g.subject);
      if(high&&!impactOk) requiredEvidence.push(`impact-analysis:${g.subject}`);
      const constitutionalConflict=g.findings.some((f)=>f.constitutionalConflict===true);
      const reviews=new Set(["human-owner"]);
      if(high) reviews.add("kernel-governance");
      if(g.findings.some((f)=>f.securityRelevant===true||f.tags?.includes?.("security"))) reviews.add("security");
      const state=constitutionalConflict?"blocked":requiredEvidence.length?"needs-evidence":"needs-review";
      const recommendation=g.findings.find((f)=>typeof f.recommendation==="string"&&f.recommendation.trim())?.recommendation??`Correct the governed condition affecting ${g.subject}.`;
      return freeze({
        proposalId:`proposal.${safe(sourceReflectionId)}.${safe(g.subject)}.${safe(g.category)}.${i+1}`,
        sourceReflectionId, sourceReferences:[sourceReflectionId,...g.findings.map((f)=>f.ruleId).filter(Boolean)],
        subject:g.subject, category:g.category, priority,
        rationale:g.findings.map((f)=>f.statement).filter((x)=>typeof x==="string"&&x.trim()).join(" ")||`${g.findings.length} governed finding(s) affect ${g.subject}.`,
        findings:copy(g.findings), recommendation,
        alternatives:[
          {type:"corrective-action",action:recommendation,ownerRequired:true,expiryRequired:false,riskRecordRequired:high},
          {type:"temporary-acceptance",action:`Temporarily accept the condition affecting ${g.subject}.`,ownerRequired:true,expiryRequired:true,riskRecordRequired:true},
          {type:"retire-or-archive",action:`Retire or archive ${g.subject} when correction is not justified.`,ownerRequired:true,expiryRequired:false,riskRecordRequired:true}
        ],
        requiredEvidence:[...new Set(requiredEvidence)].sort(), requiredReviews:[...reviews].sort(),
        impactAnalysisRequired:high, impactAnalysisComplete:impactOk, constitutionalConflict, decisionState:state,
        humanApprovalRequired:true, mutationAllowed:false, executionAllowed:false
      });
    }).sort((a,b)=>RANK.get(a.priority)-RANK.get(b.priority)||a.subject.localeCompare(b.subject)).slice(0,maxProposals);

    const generatedAt=this.clock(); str(generatedAt,"generatedAt");
    return freeze({
      planningId:`planning.${generatedAt.replace(/[-:.TZ]/g,"").toLowerCase()}`,
      generatedAt,requestedBy,scope,objective,tenantId,cycleId,sourceReflectionId,
      mode:"advisory",mutationAllowed:false,approvalAllowed:false,executionAllowed:false,
      summary:{
        proposalCount:proposals.length,
        blockedCount:proposals.filter((p)=>p.decisionState==="blocked").length,
        needsEvidenceCount:proposals.filter((p)=>p.decisionState==="needs-evidence").length,
        needsReviewCount:proposals.filter((p)=>p.decisionState=="needs-review").length
      },
      proposals:copy(proposals),
      constraints:{
        humanApprovalRequired:true,automaticMutationAllowed:false,automaticApprovalAllowed:false,
        automaticExecutionAllowed:false,tenantIsolationRequired:true,
        impactAnalysisRequiredForHighPriority:true,sourceOfTruth:"institutional-reflection"
      }
    });
  }
}
export function createPlanningEngine(options={}){ return new PlanningEngine(options); }
export const planningPriorities=PRIORITIES;
