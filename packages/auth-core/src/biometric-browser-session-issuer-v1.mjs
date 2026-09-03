
import { randomBytes as rb, randomUUID } from "node:crypto";
import { browserSessionCookieName, hashBrowserSessionSecret, serializeBrowserSessionCookie } from "./browser-session-authenticator.mjs";

export const BIOMETRIC_BROWSER_SESSION_ISSUER_V1=Object.freeze({
 version:"biometric-browser-session-issuer/v1",mode:"sandbox-conformance",
 sourceDecisionVersion:"trust-biometric-login-decision/v1",productionEnabled:false,
 rawBiometricMaterialAccepted:false,rawBiometricMaterialPersisted:false,sessionSecretPersisted:false
});
export class BiometricBrowserSessionIssuerV1Error extends Error{constructor(code,message){super(message);this.name="BiometricBrowserSessionIssuerV1Error";this.code=code}}
const fail=(c,m)=>{throw new BiometricBrowserSessionIssuerV1Error(c,m)};
const t=(v,f)=>{if(typeof v!=="string"||!v.trim())fail("invalid_input",`${f} required`);return v.trim()};
const o=(v,f)=>{if(!v||typeof v!=="object"||Array.isArray(v))fail("invalid_input",`${f} object required`);return v};
const safe=new Set(["rawBiometricMaterialForwarded","rawBiometricMaterialPersisted","rawBiometricMaterialAccepted"]);
const bad=/(^|_)(raw|image|video|selfie|photo|template|embedding|biometric|ciphertext|private_key|key_material|kms_material|secret|password|token|cookie)(s)?(_|$)/i;
function scan(v,p="$",seen=new Set()){if(v==null)return;if(Buffer.isBuffer(v)||ArrayBuffer.isView(v)||v instanceof ArrayBuffer)fail("sensitive_material_forbidden",`binary at ${p}`);if(typeof v!=="object")return;if(seen.has(v))fail("circular_input_forbidden",`circular at ${p}`);seen.add(v);if(Array.isArray(v)){v.forEach((x,i)=>scan(x,`${p}[${i}]`,seen))}else for(const [k,x] of Object.entries(v)){const n=k.replace(/([a-z0-9])([A-Z])/g,"$1_$2").replace(/[^a-zA-Z0-9]+/g,"_").toLowerCase();if(!safe.has(k)&&bad.test(n))fail("sensitive_material_forbidden",`field ${p}.${k} forbidden`);scan(x,`${p}.${k}`,seen)}seen.delete(v)}
function d(v,f){v=t(v,f).toLowerCase();if(!/^sha256:[0-9a-f]{64}$/.test(v))fail("invalid_policy_digest",`${f} invalid`);return v}
function source(input){
 const x=o(input,"loginDecision");scan(x);
 if(x.version!==BIOMETRIC_BROWSER_SESSION_ISSUER_V1.sourceDecisionVersion)fail("unsupported_login_decision","unsupported version");
 if(x.mode!=="sandbox-conformance"||x.productionAuthorized!==false||x.productionReady!==false)fail("production_not_authorized","non-production decision required");
 if(x.status!=="authorized")fail("login_decision_not_authorized","decision not authorized");
 if(x.rawBiometricMaterialForwarded!==false||x.rawBiometricMaterialPersisted!==false)fail("sensitive_material_forbidden","raw biometric flags invalid");
 const a=o(x.authentication,"authentication");
 if(a.method!=="trust_biometric_face_sandbox"||a.modality!=="face"||a.policyProductionValidated!==false)fail("unsupported_authentication_method","sandbox face auth required");
 const id=o(x.identity,"identity"),p=o(id.principal,"principal");
 if(id.role!=="client"||p.status!=="active"||p.authenticationMethod!=="trust_biometric_face_sandbox")fail("invalid_principal","active biometric client principal required");
 const tenant=t(p.tenantId,"principal.tenantId"), access=o(x.access,"access");
 if(access.allowed!==true)fail("saas_access_not_authorized","access must be allowed");
 if(t(access.tenantId,"access.tenantId")!==tenant)fail("tenant_mismatch","tenant mismatch");
 const s=o(x.session,"session");
 if(s.issued!==false||s.issuanceAllowed!==false||s.nextStage!=="auth-core-session-issuance")fail("invalid_session_handoff","invalid handoff");
 return Object.freeze({
  verificationId:t(a.verificationId,"verificationId"),providerId:t(a.providerId,"providerId"),
  biometricPolicyId:t(a.policyId,"policyId"),biometricPolicyDigest:d(a.policyDigest,"policyDigest"),
  principal:Object.freeze({id:t(p.id,"principal.id"),tenantId:tenant,status:"active",scopes:Object.freeze(Array.isArray(p.scopes)?[...new Set(p.scopes.map(v=>t(v,"scope")))].sort():[])}),
  access:Object.freeze({workspaceId:t(access.workspaceId,"workspaceId"),productId:t(access.productId,"productId"),accessGrantId:t(access.accessGrantId,"accessGrantId")})
 })
}
function policy(v){v=o(v,"issuancePolicy");scan(v);if(v.allowed!==true)fail("session_issuance_denied",v.reason||"issuance denied");if(v.productionValidated!==false)fail("production_not_authorized","issuance policy must be non-production");return {policyId:t(v.policyId,"policyId"),policyDigest:d(v.policyDigest,"policyDigest")}}
export function createBiometricBrowserSessionIssuer({persistSession,authorizeSessionIssuance,randomBytes=rb,createSessionId=()=>`session-${randomUUID()}`,now=()=>new Date(),maxAgeSeconds=900,cookieName=browserSessionCookieName}={}){
 if(typeof persistSession!=="function"||typeof authorizeSessionIssuance!=="function")throw new TypeError("persistSession and authorizeSessionIssuance required");
 if(!Number.isInteger(maxAgeSeconds)||maxAgeSeconds<1||maxAgeSeconds>3600)throw new TypeError("invalid maxAgeSeconds");
 return Object.freeze({profile:BIOMETRIC_BROWSER_SESSION_ISSUER_V1,async issue({loginDecision}={}){
  const src=source(loginDecision);
  const pol=policy(await authorizeSessionIssuance(Object.freeze({verificationId:src.verificationId,principalId:src.principal.id,tenantId:src.principal.tenantId,workspaceId:src.access.workspaceId,productId:src.access.productId,accessGrantId:src.access.accessGrantId,biometricPolicyId:src.biometricPolicyId,biometricPolicyDigest:src.biometricPolicyDigest})));
  const n=now();if(!(n instanceof Date)||Number.isNaN(n.getTime()))fail("invalid_clock","invalid clock");
  const b=randomBytes(32);if(!Buffer.isBuffer(b)||b.length!==32)fail("invalid_random_source","32 random bytes required");
  const secret=b.toString("base64url"),hash=hashBrowserSessionSecret(secret),sessionId=t(createSessionId(),"sessionId"),expiresAt=new Date(n.getTime()+maxAgeSeconds*1000).toISOString();
  const rec=Object.freeze({sessionId,secretHash:hash,status:"active",principal:src.principal,issuedAt:n.toISOString(),expiresAt,revokedAt:null,sourceAuthenticationMethod:"trust_biometric_face_sandbox",sourceVerificationId:src.verificationId,sourceProviderId:src.providerId,biometricPolicyId:src.biometricPolicyId,biometricPolicyDigest:src.biometricPolicyDigest,issuancePolicyId:pol.policyId,issuancePolicyDigest:pol.policyDigest,accessGrantId:src.access.accessGrantId,workspaceId:src.access.workspaceId,productId:src.access.productId,productionAuthorized:false});
  const ok=await persistSession(rec);if(ok===false||ok===null)fail("session_persistence_failed","persistence failed");
  return Object.freeze({version:BIOMETRIC_BROWSER_SESSION_ISSUER_V1.version,mode:"sandbox-conformance",status:"issued",sessionId,expiresAt,cookieName,setCookieHeader:serializeBrowserSessionCookie({sessionSecret:secret,maxAgeSeconds,cookieName}),principal:src.principal,accessGrantId:src.access.accessGrantId,sessionSecretPersisted:false,rawBiometricMaterialPersisted:false,productionAuthorized:false,productionReady:false})
 }})
}
