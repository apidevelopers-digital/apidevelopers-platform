const P=Object.freeze(["critical","high","medium","low","info"]);
const R=new Map(P.map((v,i)=>[v,i]));
const cp=v=>v==null?v:structuredClone(v);
function fr(v){if(!v||typeof v!=="object"||Object.isFrozen(v))return v;Object.freeze(v);for(const x of Object.values(v))fr(x);return v}
function s(v,n){if(typeof v!=="string"||!v.trim())throw new TypeError(`${n} must be a non-empty string`)}
function o(v,n){if(!v||typeof v!=="object"||Array.isArray(v))throw new TypeError(`${n} must be an object`)}
const slug=v=>String(v).trim().toLowerCase().replace(/[^a-z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"unknown";
const sev=v=>R.has(v)?v:"info";
function grouped(fs){
 const m=new Map();
 fs.forEach((f,i)=>{o(f,`reflectionReport.findings[${i}]`);s(f.subject,`reflectionReport.findings[${i}].subject`);
  const c=typeof f.category==="string"&&f.category.trim()?f.category.trim().toLowerCase():"general",k=`${f.subject}\0${c}`;
  if(!m.has(k))m.set(k,{subject:f.subject,category:c,findings:[]});m.get(k).findings.push(cp(f));
 });
 return [...m.values()].sort((a,b)=>a.subject.localeCompare(b.subject)||a.category.localeCompare(b.category));
}
function impactOk(x,subject){return Boolean(x&&(x.complete===true&&!x.subject||x.subject===subject&&x.complete!==false||Array.isArray(x.items)&&x.items.some(i=>i?.subject===subject&&i.complete!==false)))}
function evidence(g,report){const shared=Array.isArray(report.evidence)?report.evidence:[];return g.findings.flatMap(f=>[...(Array.isArray(f.evidence)?f.evidence:[]),...shared.filter(x=>!x||typeof x!=="object"||!x.subject||x.subject===f.subject)]).filter(Boolean)}
const usable=x=>typeof x==="string"?Boolean(x.trim()):Boolean(x&&typeof x==="object"&&x.status!=="expired");

export class PlanningEngine{
 constructor({clock=()=>new Date().toISOString()}={}){if(typeof clock!=="function")throw new TypeError("clock must be a function");this.clock=clock}
 plan({tenantId,cycleId,reflectionReport}={},opt={}){
  const {requestedBy="system",scope="platform",objective="governed-evolution",maxProposals=20,impactAnalysis=null}=opt;
  for(const [v,n] of [[tenantId,"tenantId"],[cycleId,"cycleId"],[requestedBy,"requestedBy"],[scope,"scope"],[objective,"objective"]])s(v,n);
  o(reflectionReport,"reflectionReport");
  if(reflectionReport.tenantId!==tenantId)throw new Error("cross-tenant planning blocked");
  if(reflectionReport.cycleId!==cycleId)throw new Error("planning cycle mismatch");
  if(!["advisory","read-only"].includes(reflectionReport.mode))throw new Error("reflectionReport must be advisory or read-only");
  if(!Number.isInteger(maxProposals)||maxProposals<1)throw new TypeError("maxProposals must be a positive integer");
  const fs=reflectionReport.findings??reflectionReport.conclusions;if(!Array.isArray(fs))throw new TypeError("reflectionReport.findings must be an array");
  const sourceReflectionId=reflectionReport.reflectionId??reflectionReport.reasoningId??reflectionReport.id;s(sourceReflectionId,"reflectionReport.reflectionId");
  const proposals=grouped(fs).map((g,i)=>{
   const priority=g.findings.map(f=>sev(f.severity)).sort((a,b)=>R.get(a)-R.get(b))[0]??"info",high=["critical","high"].includes(priority);
   const ev=evidence(g,reflectionReport),requiredEvidence=[];if(!ev.some(usable))requiredEvidence.push(`evidence:${g.subject}`);
   const impactAnalysisComplete=impactOk(impactAnalysis,g.subject);if(high&&!impactAnalysisComplete)requiredEvidence.push(`impact-analysis:${g.subject}`);
   const constitutionalConflict=g.findings.some(f=>f.constitutionalConflict===true),reviews=new Set(["human-owner"]);if(high)reviews.add("kernel-governance");
   if(g.findings.some(f=>f.securityRelevant===true||f.tags?.includes?.("security")))reviews.add("security");
   const decisionState=constitutionalConflict?"blocked":requiredEvidence.length?"needs-evidence":"needs-review";
   const recommendation=g.findings.find(f=>typeof f.recommendation==="string"&&f.recommendation.trim())?.recommendation??`Correct the governed condition affecting ${g.subject}.`;
   return fr({proposalId:`proposal.${slug(sourceReflectionId)}.${slug(g.subject)}.${slug(g.category)}.${i+1}`,sourceReflectionId,
    sourceReferences:[sourceReflectionId,...g.findings.map(f=>f.ruleId).filter(Boolean)],subject:g.subject,category:g.category,priority,
    rationale:g.findings.map(f=>f.statement).filter(x=>typeof x==="string"&&x.trim()).join(" ")||`${g.findings.length} governed finding(s) affect ${g.subject}.`,
    findings:cp(g.findings),recommendation,requiredEvidence:[...new Set(requiredEvidence)].sort(),requiredReviews:[...reviews].sort(),
    impactAnalysisRequired:high,impactAnalysisComplete,constitutionalConflict,decisionState,humanApprovalRequired:true,mutationAllowed:false,executionAllowed:false});
  }).sort((a,b)=>R.get(a.priority)-R.get(b.priority)||a.subject.localeCompare(b.subject)).slice(0,maxProposals);
  const generatedAt=this.clock();s(generatedAt,"generatedAt");
  return fr({planningId:`planning.${generatedAt.replace(/[-:.TZ]/g,"").toLowerCase()}`,generatedAt,requestedBy,scope,objective,tenantId,cycleId,sourceReflectionId,
   mode:"advisory",mutationAllowed:false,approvalAllowed:false,executionAllowed:false,
   summary:{proposalCount:proposals.length,blockedCount:proposals.filter(p=>p.decisionState==="blocked").length,needsEvidenceCount:proposals.filter(p=>p.decisionState==="needs-evidence").length,needsReviewCount:proposals.filter(p=>p.decisionState==="needs-review").length},
   proposals:cp(proposals),constraints:{humanApprovalRequired:true,automaticMutationAllowed:false,automaticApprovalAllowed:false,automaticExecutionAllowed:false,tenantIsolationRequired:true,impactAnalysisRequiredForHighPriority:true,sourceOfTruth:"institutional-reflection"}});
 }
}
export const createPlanningEngine=(options={})=>new PlanningEngine(options);
export const planningPriorities=P;
