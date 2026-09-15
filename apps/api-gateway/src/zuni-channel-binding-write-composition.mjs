import { secureCompareSecrets } from "@apidevelopers/auth-core";
import { createSaasRuntime, createZuniChannelBindingRuntime } from "@apidevelopers/saas-runtime";

export const zuniChannelBindingWritePath="/v1/zuni/channel-bindings/register";
export const ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION="ZUNI_CHANNEL_BINDING_WRITE_V1";
export const ZUNI_CHANNEL_BINDING_WRITE_CONSUMER_PRINCIPAL_ID="server.zuni-channel-binding-writer";
const KEYS=new Set(["tenantId","workspaceId","credentialRef","wabaId","phoneNumberId"]);
const HEADERS=Object.freeze({"content-type":"application/json; charset=utf-8","cache-control":"no-store",pragma:"no-cache","x-content-type-options":"nosniff"});
const text=v=>String(v??"").trim();
const reply=(status,payload)=>Object.freeze({status,headers:HEADERS,body:JSON.stringify(payload)});
const header=(headers,name)=>{const hit=Object.entries(headers??{}).find(([key])=>String(key).toLowerCase()===name);const value=hit?.[1];return text(Array.isArray(value)?value.join(", "):value)};
const body=value=>{if(value&&typeof value==="object"&&!Array.isArray(value))return value;const parsed=JSON.parse(String(value??""));if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))throw new Error("invalid_json");return parsed};
const safe=b=>Object.freeze({bindingId:text(b?.bindingId)||null,tenantId:text(b?.tenantId)||null,workspaceId:text(b?.workspaceId)||null,channelId:text(b?.channelId)||null,wabaId:text(b?.wabaId)||null,phoneNumberId:text(b?.phoneNumberId)||null,status:text(b?.status)||null});

export function createZuniChannelBindingWriteComposition({
  app,store,consumerAuthorization,enabled=false,compareSecrets=secureCompareSecrets,
  saasRuntimeFactory=createSaasRuntime,channelRuntimeFactory=createZuniChannelBindingRuntime,
  clock=()=>new Date().toISOString(),
}={}){
  if(typeof app?.handleRequest!=="function")throw new TypeError("app.handleRequest is required");
  const off=()=>Object.freeze({enabled:false,app,descriptor:Object.freeze({path:zuniChannelBindingWritePath,writeEnabled:false,productionChanged:false,secretsReturned:false,credentialMaterialAccepted:false,runtimeAutoWiring:false})});
  if(enabled!==true)return off();
  if(!store||typeof store.read!=="function"||typeof store.transaction!=="function")throw new TypeError("store must provide read and transaction");
  const expected=text(consumerAuthorization);
  if(!expected)return off();
  if(expected.length<32)throw new TypeError("write authorization must contain at least 32 characters");
  if(typeof compareSecrets!=="function")throw new TypeError("compareSecrets must be a function");
  const saasRuntime=saasRuntimeFactory({store});
  const channelRuntime=channelRuntimeFactory({store,saasRuntime});
  if(typeof channelRuntime?.registerChannelBinding!=="function")throw new TypeError("registerChannelBinding is required");

  const composed=Object.freeze({async handleRequest(request={}){
    const method=String(request.method??"GET").toUpperCase();
    const path=new URL(String(request.url??"/"),"http://api-gateway.local").pathname;
    if(method!=="POST"||path!==zuniChannelBindingWritePath)return app.handleRequest(request);
    const auth=header(request.headers,"authorization");
    if(!auth||!compareSecrets(auth,expected))return reply(401,{ok:false,error:"zuni_channel_binding_writer_unauthorized",bindingWriteExecuted:false,secretsReturned:false});
    if(header(request.headers,"x-zuni-write-authorization")!==ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION)return reply(403,{ok:false,error:"zuni_channel_binding_write_authorization_required",bindingWriteExecuted:false,secretsReturned:false});
    let input;try{input=body(request.body)}catch{return reply(400,{ok:false,error:"invalid_json",bindingWriteExecuted:false,secretsReturned:false})}
    if(Object.keys(input).some(key=>!KEYS.has(key)))return reply(400,{ok:false,error:"zuni_channel_binding_write_payload_invalid",bindingWriteExecuted:false,secretsReturned:false});
    const tenantId=text(input.tenantId),workspaceId=text(input.workspaceId),credentialRef=text(input.credentialRef),wabaId=text(input.wabaId),phoneNumberId=text(input.phoneNumberId);
    if(!tenantId||!workspaceId||!credentialRef||!wabaId||!phoneNumberId)return reply(400,{ok:false,error:"zuni_channel_binding_write_fields_required",bindingWriteExecuted:false,secretsReturned:false});
    let binding;try{const now=clock();binding=await channelRuntime.registerChannelBinding({tenantId,workspaceId,productId:"zuni",provider:"meta",channelType:"whatsapp_business",channelId:phoneNumberId,wabaId,phoneNumberId,credentialRef,status:"active",createdAt:now,updatedAt:now})}catch{return reply(409,{ok:false,error:"zuni_channel_binding_write_rejected",bindingWriteExecuted:false,secretsReturned:false})}
    const result=safe(binding);
    if(!result.bindingId||result.tenantId!==tenantId||result.workspaceId!==workspaceId||result.channelId!==phoneNumberId||result.phoneNumberId!==phoneNumberId||result.wabaId!==wabaId||result.status!=="active")return reply(502,{ok:false,error:"zuni_channel_binding_write_result_invalid",bindingWriteExecuted:true,secretsReturned:false});
    return reply(200,{ok:true,binding:result,channelId:result.channelId,bindingWriteExecuted:true,secretsReturned:false});
  }});
  return Object.freeze({enabled:true,app:composed,channelRuntime,descriptor:Object.freeze({path:zuniChannelBindingWritePath,writeEnabled:true,productionChanged:false,secretsReturned:false,credentialMaterialAccepted:false,consumerConfigured:true,consumerPrincipalId:ZUNI_CHANNEL_BINDING_WRITE_CONSUMER_PRINCIPAL_ID,runtimeAutoWiring:false})});
}
