import{AccountAccessContextResolutionError}from"./account-access-context-preview.mjs";
export const accountAccessContextResolvePath="/v1/account/access-context/resolve";
const H=Object.freeze({"content-type":"application/json; charset=utf-8","cache-control":"no-store",pragma:"no-cache","x-content-type-options":"nosniff"});
const resp=(status,payload)=>Object.freeze({status,headers:H,body:JSON.stringify(payload)});
function body(v){if(v&&typeof v==="object"&&!Array.isArray(v))return v;if(typeof v!=="string"||!v.trim())throw Object.assign(new Error("invalid_json"),{status:400});try{const p=JSON.parse(v);if(!p||typeof p!=="object"||Array.isArray(p))throw 0;return p}catch{throw Object.assign(new Error("invalid_json"),{status:400})}}
async function authenticate(authenticator,headers,expectedId){const a=await authenticator.authenticate(headers??{});const id=typeof a?.principal?.id==="string"?a.principal.id.trim():"";if(!a||a.role!=="server"||!id||id!==expectedId)throw Object.assign(new Error("account_access_context_consumer_unauthorized"),{status:401});}
export function createAccountAccessContextHttpApp({app,resolver,consumerAuthenticator,consumerPrincipalId}={}){
 if(typeof app?.handleRequest!=="function")throw new TypeError("app.handleRequest is required");
 if(typeof resolver?.resolve!=="function"||typeof consumerAuthenticator?.authenticate!=="function"||typeof consumerPrincipalId!=="string"||!consumerPrincipalId.trim())return Object.freeze({enabled:false,app});
 const expected=consumerPrincipalId.trim();
 return Object.freeze({enabled:true,app:Object.freeze({async handleRequest(request={}){
  const method=String(request.method??"GET").toUpperCase(),path=new URL(String(request.url??"/"),"http://api-gateway.local").pathname;
  if(method!=="POST"||path!==accountAccessContextResolvePath)return app.handleRequest(request);
  try{await authenticate(consumerAuthenticator,request.headers,expected);const p=body(request.body);const keys=Object.keys(p);if(keys.some(k=>!["accountId","tenantId"].includes(k)))return resp(400,{ok:false,resolved:false,error:"account_access_context_payload_invalid"});
   const context=await resolver.resolve({accountId:p.accountId,tenantId:p.tenantId});return resp(200,{ok:true,resolved:true,context});
  }catch(e){const status=e instanceof AccountAccessContextResolutionError?e.status:(e?.status===400||e?.status===401?e.status:503);const error=e instanceof AccountAccessContextResolutionError?e.code:(status===400?"invalid_json":status===401?"account_access_context_consumer_unauthorized":"account_access_context_unavailable");return resp(status,{ok:false,resolved:false,error});}
 }})});
}