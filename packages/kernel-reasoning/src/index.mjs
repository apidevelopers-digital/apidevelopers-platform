function clone(value) {
  return value == null ? value : structuredClone(value);
}
function deepFreeze(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}
function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}
function assertString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
}
function kindOf(node) {
  return node?.kind ?? (typeof node?.id === "string" ? node.id.split(".")[0] : "unknown");
}
function indexSnapshot(snapshot) {
  assertObject(snapshot, "knowledgeSnapshot");
  const nodes = Array.isArray(snapshot.nodes) ? snapshot.nodes : [];
  const relations = Array.isArray(snapshot.relations) ? snapshot.relations : [];
  const byId = new Map(nodes.filter((node) => node?.id).map((node) => [node.id, node]));
  const incoming = new Map();
  const outgoing = new Map();
  for (const node of nodes) {
    if (!node?.id) continue;
    incoming.set(node.id, []);
    outgoing.set(node.id, []);
  }
  for (const relation of relations) {
    if (!relation?.from || !relation?.to) continue;
    if (!incoming.has(relation.to)) incoming.set(relation.to, []);
    if (!outgoing.has(relation.from)) outgoing.set(relation.from, []);
    incoming.get(relation.to).push(relation);
    outgoing.get(relation.from).push(relation);
  }
  return { nodes, relations, byId, incoming, outgoing };
}
function conclusion(ruleId, severity, subject, statement, premises, recommendation) {
  return { ruleId, severity, subject, statement, premises: clone(premises), recommendation, confidence: 1, mode: "deterministic" };
}
function detectCycles(nodes, outgoing) {
  const findings = [];
  const visited = new Set();
  const stack = new Set();
  function visit(id, path) {
    if (stack.has(id)) {
      const start = path.indexOf(id);
      const cycle = [...path.slice(start), id];
      findings.push(conclusion("RSN-003","high",id,`Circular dependency detected: ${cycle.join(" -> ")}`,cycle,"Break the dependency cycle through an explicit boundary, adapter or ownership inversion."));
      return;
    }
    if (visited.has(id)) return;
    visited.add(id); stack.add(id);
    for (const relation of (outgoing.get(id) ?? []).filter((item)=>item.type==="depends_on")) visit(relation.to,[...path,id]);
    stack.delete(id);
  }
  for (const node of nodes) if (node?.id) visit(node.id,[]);
  const unique=new Map();
  for (const finding of findings) {
    const key=[...finding.premises].sort().join("|");
    if(!unique.has(key)) unique.set(key,finding);
  }
  return [...unique.values()];
}

export class ReasoningEngine {
  constructor({ clock = () => new Date().toISOString() } = {}) {
    if (typeof clock !== "function") throw new TypeError("clock must be a function");
    this.clock = clock;
  }
  infer({ tenantId, cycleId, knowledgeSnapshot, memorySnapshot } = {}, { scope = "platform", requestedBy = "system" } = {}) {
    assertString(tenantId,"tenantId"); assertString(cycleId,"cycleId"); assertString(scope,"scope"); assertString(requestedBy,"requestedBy");
    assertObject(memorySnapshot,"memorySnapshot");
    if (memorySnapshot.tenantId !== tenantId) throw new Error("cross-tenant reasoning blocked");
    if (memorySnapshot.mutationAllowed !== false || memorySnapshot.mode !== "append-only") throw new Error("memorySnapshot must be append-only and read-only");
    const { nodes, byId, incoming, outgoing } = indexSnapshot(knowledgeSnapshot);
    const conclusions=[];
    for (const node of nodes) {
      if (!node?.id) continue;
      const kind=kindOf(node);
      if(kind==="capability" && node.status==="active"){
        const providers=(incoming.get(node.id)??[]).filter((r)=>r.type==="implements" && kindOf(byId.get(r.from))==="component");
        if(providers.length===0) conclusions.push(conclusion("RSN-001","high",node.id,"Active Capability has no implementing Component.",[node.id],"Register or activate at least one Component that implements this Capability."));
      }
      if(kind==="component" && node.status==="active"){
        const contracts=(outgoing.get(node.id)??[]).filter((r)=>r.type==="references" && kindOf(byId.get(r.to))==="contract");
        if(contracts.length===0) conclusions.push(conclusion("RSN-002","medium",node.id,"Active Component has no referenced Contract.",[node.id],"Attach at least one versioned Contract before promotion or external use."));
      }
      if(kind==="policy" && node.status==="active"){
        const targets=(outgoing.get(node.id)??[]).filter((r)=>r.type==="applies_to");
        if(targets.length===0) conclusions.push(conclusion("RSN-004","low",node.id,"Active Policy has no target.",[node.id],"Link the Policy to governed concepts or retire it."));
      }
      if(node.metadata?.placeholder===true) conclusions.push(conclusion("RSN-005","medium",node.id,"Placeholder node remains unresolved.",[node.id],"Replace the placeholder with a registered, owned and versioned component."));
    }
    conclusions.push(...detectCycles(nodes,outgoing));
    conclusions.sort((a,b)=>a.ruleId.localeCompare(b.ruleId)||a.subject.localeCompare(b.subject));
    const counts=conclusions.reduce((acc,item)=>{acc.total++; acc[item.severity]=(acc[item.severity]??0)+1; return acc;},{total:0,high:0,medium:0,low:0,info:0});
    const generatedAt=this.clock();
    assertString(generatedAt,"generatedAt");
    return deepFreeze({
      reasoningId:`reasoning.${generatedAt.replace(/[-:.TZ]/g,"").toLowerCase()}`,
      generatedAt, requestedBy, scope, tenantId, cycleId,
      mode:"read-only", mutationAllowed:false,
      summary:{status:counts.high>0?"attention":counts.medium>0?"review":"healthy",counts,memoryEntryCount:memorySnapshot.entryCount},
      conclusions:clone(conclusions),
      constraints:{automaticDecisionAllowed:false,automaticExecutionAllowed:false,sourceOfTruth:"institutional-knowledge-graph",memorySource:"kernel-memory",tenantIsolationRequired:true}
    });
  }
}
export function createReasoningEngine(options={}) { return new ReasoningEngine(options); }
