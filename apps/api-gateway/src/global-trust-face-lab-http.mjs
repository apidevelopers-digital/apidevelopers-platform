const P="/v1/trust/evaluation/portal/face-lab";
const V="trust-face-lab/v2";
const APPROVAL="IGOR_APROVA_TRUST_AWS_SANDBOX_REAL";
const H={"content-type":"application/json; charset=utf-8","cache-control":"no-store, max-age=0",pragma:"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer"};
function res(status,payload){return Object.freeze({status,headers:Object.freeze({...H,"x-trust-face-lab":V}),body:JSON.stringify(payload)});}
function err(code,message){const e=new Error(message);e.code=code;throw e;}
function text(v,n,max=160){const s=String(v??"").trim();if(!s||s.length>max)err("TRUST_FACE_LAB_INVALID_INPUT",`${n} is required`);return s;}
function body(v){if(typeof v!=="string"||!v.trim())err("TRUST_FACE_LAB_INVALID_JSON","invalid json");try{const x=JSON.parse(v);if(!x||typeof x!=="object"||Array.isArray(x))throw 0;return x;}catch{err("TRUST_FACE_LAB_INVALID_JSON","invalid json");}}
function bearer(h={}){const raw=h.authorization??h.Authorization;const m=/^Bearer ([A-Za-z0-9_.-]+)$/.exec(String(Array.isArray(raw)?raw[0]:raw??"").trim());if(!m)err("TRUST_FACE_LAB_UNAUTHORIZED","bearer required");return m[1];}
function flags(env){return {liveCallsEnabled:String(env?.TRUST_AWS_LIVE_CALLS_ENABLED??"")==="true",credentialsAllowed:String(env?.TRUST_AWS_CREDENTIALS_ALLOWED??"")==="true",sandboxApproved:String(env?.TRUST_AWS_SANDBOX_APPROVAL??"")===APPROVAL};}
function available(runtime,env){const f=flags(env);return Boolean(runtime)&&f.liveCallsEnabled&&f.credentialsAllowed&&f.sandboxApproved;}
function safeSession(s){return {sessionId:s.sessionId,organizationId:s.organizationId,enrollmentId:s.enrollmentId,scopes:[...(s.scopes??[])]};}
function base(session,runtime,env){const f=flags(env);return {version:V,mode:"dry-run",environment:"sandbox",provider:"aws-rekognition",region:"sa-east-1",session:safeSession(session),controls:{liveRuntimeWired:Boolean(runtime),...f,liveAvailable:available(runtime,env),productionEnabled:false,biometricMaterialAccepted:false,auditImagesLimit:0}};}
function opaque(v,n){const s=text(v,n,184);if(!/^ref:[A-Za-z0-9._/-]{1,180}$/.test(s))err("TRUST_FACE_LAB_INVALID_REFERENCE",`${n} must be opaque ref`);return s;}
function s3(v,n){if(!v||typeof v!=="object"||Array.isArray(v))err("TRUST_FACE_LAB_INVALID_INPUT",`${n} required`);if(Object.hasOwn(v,"Bytes"))err("TRUST_FACE_LAB_RAW_BIOMETRIC_FORBIDDEN",`${n}.Bytes forbidden`);const r={Bucket:text(v.Bucket,`${n}.Bucket`,255),Name:text(v.Name,`${n}.Name`,1024)};if(v.Version!=null)r.Version=text(v.Version,`${n}.Version`,1024);return r;}
function live(runtime,env){if(!available(runtime,env))err("TRUST_FACE_LAB_LIVE_NOT_AVAILABLE","live unavailable");return runtime;}
function failure(e){const m={TRUST_FACE_LAB_INVALID_JSON:[400,"invalid_json"],TRUST_FACE_LAB_INVALID_INPUT:[400,"invalid_input"],TRUST_FACE_LAB_INVALID_REFERENCE:[400,"opaque_reference_required"],TRUST_FACE_LAB_RAW_BIOMETRIC_FORBIDDEN:[400,"raw_biometric_material_forbidden"],TRUST_FACE_LAB_UNAUTHORIZED:[401,"unauthorized"],TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN:[401,"unauthorized"],TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED:[401,"unauthorized"],TRUST_FACE_LAB_LIVE_NOT_AVAILABLE:[503,"face_lab_live_not_available"]};if(m[e?.code])return m[e.code];if(typeof e?.code==="string"&&/^(invalid_|s3_|raw_|multiple_|reference_|session_|live_|credentials_|sandbox_|region_)/.test(e.code))return[400,e.code];return null;}
export function createGlobalTrustFaceLabHttpHandler({portalSession,liveRuntime=null,env=process.env}={}){
 if(typeof portalSession?.authenticate!=="function")throw new TypeError("portalSession.authenticate must be a function");
 return Object.freeze({async handleRequest({method="GET",url="/",headers={},body:requestBody}={}){
  const path=new URL(String(url),"http://api-gateway.local").pathname;if(path!==P&&!path.startsWith(`${P}/`))return null;
  try{
   const session=await portalSession.authenticate({token:bearer(headers)});const b=base(session,liveRuntime,env);const m=String(method).toUpperCase();
   if(m==="GET"&&path===`${P}/status`)return res(200,{allowed:true,faceLab:{...b,status:available(liveRuntime,env)?"live-ready":"preview-ready",capabilities:["liveness_preview","compare_faces_preview","liveness_live","compare_faces_live"],nextLiveDependency:available(liveRuntime,env)?null:"aws_provider_execution_authorization"}});
   if(m==="POST"&&path===`${P}/liveness/preview`){const x=body(requestBody);return res(200,{allowed:true,preview:{...b,verificationId:text(x.verificationId,"verificationId"),operation:"CreateFaceLivenessSession",clientAction:"StartFaceLivenessSession",resultAction:"GetFaceLivenessSessionResults",sessionTtlSeconds:180,rawBiometricMaterialForwarded:false,rawBiometricMaterialPersisted:false,governedDecisionProduced:false}});}
   if(m==="POST"&&path===`${P}/compare/preview`){const x=body(requestBody);return res(200,{allowed:true,preview:{...b,verificationId:text(x.verificationId,"verificationId"),sourceReferenceRef:opaque(x.sourceReferenceRef,"sourceReferenceRef"),targetReferenceRef:opaque(x.targetReferenceRef,"targetReferenceRef"),operation:"CompareFaces",similarityThreshold:0,qualityFilter:"NONE",providerScoreIsSignalOnly:true,governedDecisionProduced:false,rawBiometricMaterialForwarded:false,rawBiometricMaterialPersisted:false}});}
   if(m==="POST"&&path===`${P}/liveness/session`){const x=body(requestBody),r=live(liveRuntime,env);const result=await r.createLivenessSession({clientRequestToken:text(x.clientRequestToken,"clientRequestToken",64),outputConfig:{S3Bucket:text(x.outputConfig?.S3Bucket,"outputConfig.S3Bucket",255),S3KeyPrefix:text(x.outputConfig?.S3KeyPrefix,"outputConfig.S3KeyPrefix",1024)}});return res(201,{allowed:true,operation:"face-liveness-session",result});}
   if(m==="POST"&&path===`${P}/liveness/result`){const x=body(requestBody),r=live(liveRuntime,env);return res(200,{allowed:true,operation:"face-liveness-result",result:await r.getLivenessResult({sessionId:text(x.sessionId,"sessionId",128)})});}
   if(m==="POST"&&path===`${P}/compare`){const x=body(requestBody),r=live(liveRuntime,env);return res(200,{allowed:true,operation:"compare-faces",providerSignal:await r.compareFaces({sourceS3Object:s3(x.sourceS3Object,"sourceS3Object"),targetS3Object:s3(x.targetS3Object,"targetS3Object")}),trustDecision:null});}
   return res(404,{allowed:false,reason:"face_lab_route_not_found"});
  }catch(e){const f=failure(e);if(!f)throw e;return res(f[0],{allowed:false,reason:f[1]});}
 }});
}
