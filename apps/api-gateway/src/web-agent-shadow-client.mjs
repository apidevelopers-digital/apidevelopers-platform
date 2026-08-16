const PATH="/v1/cognitive/web-agent/shadow";
const RUNTIME=Object.freeze({"uni.co":"uni-co-runtime",nexus:"nexus-runtime"});
export class WebAgentShadowClientError extends Error{constructor(code,status=503){super(code);this.name="WebAgentShadowClientError";this.code=code;this.status=status}}
const fail=(c,s=502)=>{throw new WebAgentShadowClientError(c,s)}, obj=(v,n)=>v&&typeof v==="object"&&!Array.isArray(v)?v:fail(`invalid_${n}`), txt=(v,n)=>typeof v==="string"&&v.trim()?v.trim():fail(`invalid_${n}`);
function parts(v){if(!Array.isArray(v)||!v.length)fail("invalid_conversation_parts");return v.map(p=>{obj(p,"conversation_part");if(p.type!=="text")fail("web_agent_shadow_text_only",422);return Object.freeze({type:"text",text:txt(p.text,"conversation_part_text")})})}
function endpoint(baseUrl,path,allowHttp){let u;try{u=new URL(baseUrl)}catch{throw new TypeError("baseUrl must be a valid URL")}if(u.username||u.password)throw new TypeError("baseUrl must not contain credentials");if(u.protocol!=="https:"&&!(allowHttp&&u.protocol==="http:"))throw new TypeError("baseUrl must use https");return new URL(path,u).toString()}
function array(v,n,w){if(v===undefined)return undefined;if(!Array.isArray(v))fail(`invalid_${n}`);const out=[];for(const x of v){if(typeof x!=="string"||!x.trim())fail(`invalid_${n}`);const y=x.trim().slice(0,w);if(!out.includes(y))out.push(y);if(out.length>=8)break}return Object.freeze(out)}
function memory(root,agentId,tenantId,workspaceId){
  if(root.memoryContext===undefined)return undefined;
  const m=obj(root.memoryContext,"memory_context");
  if(m.mode!=="read_only")fail("web_agent_shadow_memory_not_read_only");
  if(m.agentId!==agentId||m.tenantId!==tenantId||m.workspaceId!==workspaceId)fail("web_agent_shadow_memory_identity_mismatch");
  const d=obj(m.data??{},"memory_context_data"), allowed=new Set(["summary","nextBestAction","openLoops","topics"]);
  if(Object.keys(d).some(k=>!allowed.has(k)))fail("web_agent_shadow_memory_not_minimized");
  const out={};
  for(const [k,w] of [["summary",700],["nextBestAction",280]])if(d[k]!==undefined){if(typeof d[k]!=="string"||!d[k].trim())fail(`invalid_memory_${k}`);out[k]=d[k].trim().slice(0,w)}
  for(const [k,w] of [["openLoops",160],["topics",100]]){const a=array(d[k],`memory_${k}`,w);if(a?.length)out[k]=a}
  return Object.freeze({schema:typeof m.schema==="string"&&m.schema.trim()?m.schema.trim():"apidevelopers.web-agent-memory-context.v1",mode:"read_only",data:Object.freeze(out)})
}
function outbound(envelope){
  const root=obj(envelope,"international_envelope"), c=obj(root.conversation,"conversation"), a=obj(c.agent,"agent");
  const agentId=txt(a.id,"agent_id"), runtime=txt(a.runtime,"agent_runtime");
  if(!RUNTIME[agentId]||RUNTIME[agentId]!==runtime)fail("web_agent_shadow_identity_mismatch");
  const tenantId=txt(c.tenantId,"tenant_id"), workspaceId=txt(c.workspaceId,"workspace_id"), i=obj(root.internationalContext,"international_context"), context={workspaceId};
  for(const [k,v] of [["legalRegion",i.legalRegion],["currency",i.currency],["timezone",i.timeZone]])if(typeof v==="string"&&v.trim())context[k]=v.trim();
  const mc=memory(root,agentId,tenantId,workspaceId);if(mc)context.memoryContext=mc;
  return {tenantId,requestId:typeof c.requestId==="string"?c.requestId.trim():"",correlationId:typeof c.correlationId==="string"?c.correlationId.trim():"",body:{agentId,tenantId,conversationId:txt(c.conversationId,"conversation_id"),locale:txt(i.locale??c.locale,"locale"),workspaceId,parts:parts(obj(c.input,"conversation_input").parts),context}}
}
function normalized(payload,agentId){
  const root=obj(payload,"shadow_upstream_payload");if(root.ok!==true)fail("web_agent_shadow_upstream_rejected",503);
  const r=obj(root.result,"shadow_upstream_result");if(r.agentId!==agentId||r.runtime!==RUNTIME[agentId])fail("web_agent_shadow_identity_mismatch");
  if(r.executed!==false||r.sendAllowed!==false)fail("web_agent_shadow_execution_invariant_failed");
  if((Array.isArray(r.toolProposals)&&r.toolProposals.length)||r.externalExecutionProposed===true||r.memoryWriteProposed===true)fail("web_agent_shadow_proposal_invariant_failed");
  return Object.freeze({parts:Object.freeze(parts(r.parts)),memoryRead:Boolean(r.memoryRead),memoryWriteProposed:false,toolProposals:Object.freeze([]),externalExecutionProposed:false})
}
export function createWebAgentShadowConversationService({baseUrl,apiKey,fetchImpl=globalThis.fetch,timeoutMs=8000,endpointPath=PATH,allowInsecureHttp=false}={}){
  if(typeof baseUrl!=="string"||!baseUrl.trim())throw new TypeError("baseUrl is required");if(typeof apiKey!=="string"||!apiKey.trim())throw new TypeError("apiKey is required");if(typeof fetchImpl!=="function")throw new TypeError("fetchImpl must be a function");if(!Number.isInteger(timeoutMs)||timeoutMs<=0||timeoutMs>60000)throw new TypeError("invalid timeoutMs");if(typeof endpointPath!=="string"||!endpointPath.startsWith("/"))throw new TypeError("invalid endpointPath");
  const url=endpoint(baseUrl.trim(),endpointPath,allowInsecureHttp), key=apiKey.trim();
  return Object.freeze({async handle(envelope){const out=outbound(envelope),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);let response;
    try{response=await fetchImpl(url,{method:"POST",headers:{accept:"application/json","content-type":"application/json","x-unico-api-key":key,"x-tenant-id":out.tenantId,...(out.requestId?{"x-request-id":out.requestId}:{}),...(out.correlationId?{"x-correlation-id":out.correlationId}:{})},body:JSON.stringify(out.body),signal:controller.signal})}
    catch(error){if(controller.signal.aborted||error?.name==="AbortError")throw new WebAgentShadowClientError("web_agent_shadow_timeout",504);throw new WebAgentShadowClientError("web_agent_shadow_upstream_unavailable")}
    finally{clearTimeout(timer)}
    if(!response||typeof response!=="object"||!Number.isInteger(response.status))fail("web_agent_shadow_invalid_http_response",503);if(!response.ok)fail("web_agent_shadow_upstream_rejected",response.status>=400&&response.status<=599?response.status:503);
    let payload;try{payload=await response.json()}catch{fail("web_agent_shadow_invalid_json")}return normalized(payload,out.body.agentId)
  }})
}
export const webAgentShadowEndpointPath=PATH;
