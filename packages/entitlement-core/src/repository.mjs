
import {createEntitlementSnapshot,EntitlementDomainError,freeze,isSnapshotEffective,req} from "./model.mjs";
export function createMemoryEntitlementRepository({initialSnapshots=[]}={}){
  const byId=new Map(),byEvent=new Map(),history=new Map();
  function append(input){
    const s=createEntitlementSnapshot(input),dup=byEvent.get(s.sourceEventId);
    if(dup)return freeze({snapshot:byId.get(dup),appended:false,duplicateOf:dup});
    if(byId.has(s.id))throw new EntitlementDomainError("entitlement_snapshot_id_conflict","id exists");
    const h=history.get(s.subscriptionId)??[], expected=h.length+1;
    if(s.revision!==expected)throw new EntitlementDomainError("invalid_entitlement_revision","sequential",{expectedRevision:expected,revision:s.revision});
    const prev=h.at(-1)??null;
    if(s.revision>1&&s.previousSnapshotId!==prev?.id)throw new EntitlementDomainError("invalid_previous_snapshot","previous mismatch");
    byId.set(s.id,s);byEvent.set(s.sourceEventId,s.id);h.push(s);history.set(s.subscriptionId,h);
    return freeze({snapshot:s,appended:true,duplicateOf:null})
  }
  initialSnapshots.forEach(append);
  const listHistory=id=>(history.get(req(id,"subscriptionId"))??[]).map(freeze);
  const getCurrentBySubscription=(id,at)=>listHistory(id).filter(s=>isSnapshotEffective(s,at)).sort((a,b)=>b.revision-a.revision)[0]??null;
  return Object.freeze({
    kind:"memory",append,
    getById:id=>byId.has(req(id,"snapshotId"))?freeze(byId.get(id)):null,
    getBySourceEventId:e=>{const id=byEvent.get(req(e,"sourceEventId"));return id?freeze(byId.get(id)):null},
    getCurrentBySubscription,listHistory,
    listCurrentByTenant:(tenantId,at)=>[...history.keys()].map(id=>getCurrentBySubscription(id,at)).filter(s=>s?.tenantId===req(tenantId,"tenantId")).sort((a,b)=>a.subscriptionId.localeCompare(b.subscriptionId)).map(freeze)
  })
}
