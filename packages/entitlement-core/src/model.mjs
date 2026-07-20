
export class EntitlementDomainError extends Error {
  constructor(code,message,details={}){super(message);this.name="EntitlementDomainError";this.code=code;this.details=structuredClone(details)}
}
export const req=(v,n)=>{v=String(v??"").trim();if(!v)throw new EntitlementDomainError("invalid_argument",`${n} is required`);return v}
export const iso=(v,n)=>{v=req(v,n);if(Number.isNaN(Date.parse(v)))throw new EntitlementDomainError("invalid_argument",`${n} must be ISO`);return v}
const pos=(v,n)=>{if(!Number.isSafeInteger(v)||v<1)throw new EntitlementDomainError("invalid_argument",`${n} must be positive`);return v}
const opt=(v,n)=>v==null?null:req(v,n)
export const freeze=v=>{v=structuredClone(v);(function f(x){if(x&&typeof x==="object"&&!Object.isFrozen(x)){Object.values(x).forEach(f);Object.freeze(x)}})(v);return v}
const uniq=(a,n)=>{if(!Array.isArray(a))throw new EntitlementDomainError("invalid_argument",`${n} must be array`);const r=a.map((v,i)=>req(v,`${n}[${i}]`));if(new Set(r).size!==r.length)throw new EntitlementDomainError(`duplicate_${n}`,`${n} duplicate`);return r}
const normEnt=a=>(a??[]).map(x=>freeze({key:req(x.key,"key"),value:x.value,scope:x.scope??"tenant",enforcement:x.enforcement??"hard",overage:x.overage??"deny",metadata:x.metadata??{}}))
const normMeters=a=>(a??[]).map(x=>freeze({key:req(x.key,"key"),unit:req(x.unit,"unit"),aggregation:x.aggregation??"sum",period:x.period??"month",includedUnits:x.includedUnits??null,overagePriceReference:x.overagePriceReference??null,metadata:x.metadata??{}}))
const ensureUnique=(a,k,c)=>{if(new Set(a.map(x=>x[k])).size!==a.length)throw new EntitlementDomainError(c,`${k} duplicate`)}

export function createEntitlementSnapshot(x){
  const statuses=["active","suspended","cancelled","expired"];
  if(!statuses.includes(x.status))throw new EntitlementDomainError("invalid_entitlement_status","status");
  const apiIds=uniq(x.apiIds??[],"api_ids"), entitlements=normEnt(x.entitlements), meters=normMeters(x.meters);
  ensureUnique(entitlements,"key","duplicate_entitlement");ensureUnique(meters,"key","duplicate_meter");
  const from=iso(x.effectiveFrom,"effectiveFrom"),to=x.effectiveTo==null?null:iso(x.effectiveTo,"effectiveTo");
  if(to&&Date.parse(from)>=Date.parse(to))throw new EntitlementDomainError("invalid_effective_window","window");
  return freeze({id:req(x.id,"id"),revision:pos(x.revision,"revision"),tenantId:req(x.tenantId,"tenantId"),projectId:opt(x.projectId,"projectId"),subscriptionId:req(x.subscriptionId,"subscriptionId"),productId:req(x.productId,"productId"),productVersion:pos(x.productVersion,"productVersion"),planId:req(x.planId,"planId"),planVersion:pos(x.planVersion,"planVersion"),status:x.status,apiIds,entitlements,meters,effectiveFrom:from,effectiveTo:to,sourceEventId:req(x.sourceEventId,"sourceEventId"),reason:x.reason==null?null:req(x.reason,"reason"),previousSnapshotId:opt(x.previousSnapshotId,"previousSnapshotId"),createdAt:iso(x.createdAt,"createdAt"),metadata:x.metadata??{}})
}
export const isSnapshotEffective=(s,at)=>{const t=Date.parse(iso(at,"at"));return t>=Date.parse(s.effectiveFrom)&&(s.effectiveTo==null||t<Date.parse(s.effectiveTo))}
