import { createGlobalContextV1 } from "./global-context.mjs";

const SCOPES=Object.freeze(["working","customer","episodic","semantic","handoff"]);
const KEYS=new Set(["tenantId","agentId","channelId","conversationId","correlationId","customerRef","memoryScope","consentScope","context","contentRef","destinationAgentId","handoffRef"]);
const freeze=(v)=>{if(v&&typeof v==="object"&&!Object.isFrozen(v)){Object.freeze(v);for(const c of Object.values(v))freeze(c)}return v};
const str=(v,n,m=256)=>{if(typeof v!=="string"||!v.trim())throw new TypeError(`${n} required`);const s=v.trim();if(s.length>m)throw new Error(`${n} too long`);return s};
const ref=(v,n,required=true)=>{if(v==null&&!required)return null;const s=str(v,n);if(!/^[A-Za-z0-9._:-]+$/.test(s))throw new Error(`${n} must be opaque`);return s};

export function createScopedMemoryEnvelopeV1(input={}, {clock=()=>new Date().toISOString()}={}) {
  if(!input||typeof input!=="object"||Array.isArray(input))throw new TypeError("memoryEnvelope must be an object");
  for(const k of Object.keys(input))if(!KEYS.has(k))throw new Error(`memoryEnvelope unsupported field: ${k}`);
  if(typeof clock!=="function")throw new TypeError("clock must be a function");

  const memoryScope=str(input.memoryScope,"memoryScope",32).toLowerCase();
  if(!SCOPES.includes(memoryScope))throw new Error("memoryScope invalid");
  if(input.consentScope!=null&&!Array.isArray(input.consentScope))throw new TypeError("consentScope must be an array");
  const consentScope=[...new Set((input.consentScope??[]).map((x,i)=>str(x,`consentScope[${i}]`,128)))].sort();
  const destinationAgentId=ref(input.destinationAgentId,"destinationAgentId",false);
  const handoffRef=ref(input.handoffRef,"handoffRef",false);

  if(memoryScope==="handoff"){
    if(!destinationAgentId||!handoffRef||!consentScope.includes("handoff:read"))throw new Error("handoff requires destinationAgentId, handoffRef and handoff:read");
  } else if(destinationAgentId||handoffRef) throw new Error("handoff fields require handoff scope");

  return freeze({
    schemaVersion:1,
    tenantId:ref(input.tenantId,"tenantId"), agentId:ref(input.agentId,"agentId"),
    channelId:ref(input.channelId,"channelId"), conversationId:ref(input.conversationId,"conversationId"),
    correlationId:ref(input.correlationId,"correlationId"), customerRef:ref(input.customerRef,"customerRef",false),
    memoryScope, consentScope, context:createGlobalContextV1(input.context),
    contentRef:ref(input.contentRef,"contentRef"), destinationAgentId, handoffRef,
    recordedAt:str(clock(),"recordedAt",64),
    mutationAllowed:false, crossTenantReadAllowed:false, crossAgentWriteAllowed:false,
  });
}

export function evaluateScopedMemoryReadV1(e, r={}) {
  const tenantId=ref(r.tenantId,"requester.tenantId"), agentId=ref(r.agentId,"requester.agentId");
  let allowed=false, reason="cross_agent_read_blocked";
  if(tenantId!==e.tenantId)reason="cross_tenant_read_blocked";
  else if(agentId===e.agentId){allowed=true;reason="same_agent"}
  else if(e.memoryScope==="handoff"&&agentId===e.destinationAgentId&&e.consentScope?.includes("handoff:read")){allowed=true;reason="authorized_handoff"}
  return freeze({schemaVersion:1,allowed,reason,actionClass:"R1",mutationAllowed:false});
}
export const memoryScopesV1=SCOPES;
