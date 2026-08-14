import{createHash,randomBytes,timingSafeEqual}from"node:crypto";
const E="trust.evaluation.recipient_key_enrollments",S="trust.evaluation.portal_sessions";
export const TRUST_EVALUATION_PORTAL_SESSION_VERSION="trust-evaluation-portal-session/v1";
const err=(code,msg)=>{let e=new Error(msg);e.code=code;throw e};
const txt=(v,n)=>{v=String(v??"").trim();if(!v)err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_INPUT",`${n} is required`);return v};
const iso=(v,n)=>{v=txt(v,n);if(Number.isNaN(Date.parse(v)))err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TIME",`${n} invalid`);return v};
const dig=v=>createHash("sha256").update(v,"utf8").digest("base64url");
const eq=(a,b)=>{a=Buffer.from(a,"utf8");b=Buffer.from(b,"utf8");return a.length===b.length&&timingSafeEqual(a,b)};
const tok=v=>{v=txt(v,"token");let m=/^trust_session_([A-Za-z0-9_-]{16,})\.([A-Za-z0-9_-]{32,})$/.exec(v);if(!m)err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TOKEN","invalid token");return{token:v,sessionId:m[1]}};
export function trustEvaluationEnrollmentIdFor(org){return dig(`trust-evaluation-recipient-key-enrollment:${txt(org,"organizationId")}`)}
function norm(r,org){
 const pop=r?.keyPossessionVerified===true||r?.proof?.keyPossessionVerified===true;
 const ext=r?.identityVerifiedByThisService===false||r?.identityVerification?.performedByThisService===false;
 if(!r||r.status!=="approved"||r.organizationId!==org||!pop||!ext||!r.enrollmentId||!r.recipientPublicKeySpkiPem||!r.recipientKeyFingerprint)
  err("TRUST_EVALUATION_PORTAL_SESSION_ENROLLMENT_REQUIRED","approved enrollment required");
 return Object.freeze({enrollmentId:r.enrollmentId,organizationId:r.organizationId,recipientPublicKeySpkiPem:r.recipientPublicKeySpkiPem,recipientKeyFingerprint:r.recipientKeyFingerprint});
}
export function createGlobalTrustEvaluationPortalSessionService({store,recipientKeyProofService,clock=()=>new Date().toISOString(),randomBytesFn=randomBytes,sessionTtlMs=900000}={}){
 if(!store||typeof store.read!=="function"||typeof store.transaction!=="function")err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_STORE","store required");
 if(!recipientKeyProofService||typeof recipientKeyProofService.issueChallenge!=="function"||typeof recipientKeyProofService.verifyAndConsume!=="function")err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_PROOF_SERVICE","proof service required");
 if(typeof clock!=="function"||typeof randomBytesFn!=="function")err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_DEPENDENCY","dependencies required");
 if(!Number.isSafeInteger(sessionTtlMs)||sessionTtlMs<60000||sessionTtlMs>3600000)err("TRUST_EVALUATION_PORTAL_SESSION_INVALID_TTL","invalid ttl");
 async function enrollment(org){
  org=txt(org,"organizationId");let id=trustEvaluationEnrollmentIdFor(org),st=await store.read();
  return norm(st.collections?.[E]?.[id]??null,org);
 }
 return Object.freeze({
  async begin({organizationId,correlationId}={}){
   let org=txt(organizationId,"organizationId"),en=await enrollment(org);
   let c=await recipientKeyProofService.issueChallenge({organizationId:org,recipientPublicKey:en.recipientPublicKeySpkiPem,correlationId:txt(correlationId,"correlationId"),ttlMs:120000});
   return Object.freeze({version:TRUST_EVALUATION_PORTAL_SESSION_VERSION,organizationId:org,enrollmentId:en.enrollmentId,challengeId:c.challengeId,signingPayloadB64u:c.signingPayloadB64u,algorithm:c.algorithm,expiresAt:c.expiresAt});
  },
  async complete({organizationId,challengeId,signatureB64u}={}){
   let org=txt(organizationId,"organizationId"),en=await enrollment(org);
   let p=await recipientKeyProofService.verifyAndConsume({challengeId:txt(challengeId,"challengeId"),recipientPublicKey:en.recipientPublicKeySpkiPem,signatureB64u:txt(signatureB64u,"signatureB64u")});
   if(p.organizationId!==org||p.recipientKeyFingerprint!==en.recipientKeyFingerprint||p.keyPossessionVerified!==true)err("TRUST_EVALUATION_PORTAL_SESSION_PROOF_MISMATCH","proof mismatch");
   let issuedAt=iso(clock(),"clock()"),expiresAt=new Date(Date.parse(issuedAt)+sessionTtlMs).toISOString();
   let sessionId=Buffer.from(randomBytesFn(18)).toString("base64url"),secret=Buffer.from(randomBytesFn(32)).toString("base64url");
   if(sessionId.length<16||secret.length<32)err("TRUST_EVALUATION_PORTAL_SESSION_WEAK_RANDOM","weak random");
   let token=`trust_session_${sessionId}.${secret}`,record=Object.freeze({version:TRUST_EVALUATION_PORTAL_SESSION_VERSION,sessionId,tokenDigest:dig(token),status:"active",organizationId:org,enrollmentId:en.enrollmentId,recipientKeyFingerprint:en.recipientKeyFingerprint,scopes:Object.freeze(["trust:evaluation:portal"]),issuedAt,expiresAt,revokedAt:null});
   await store.transaction(tx=>{if(tx.get(S,sessionId))err("TRUST_EVALUATION_PORTAL_SESSION_CONFLICT","collision");tx.put(S,sessionId,record,{ifAbsent:true});return record});
   return Object.freeze({version:TRUST_EVALUATION_PORTAL_SESSION_VERSION,token,sessionId,organizationId:org,enrollmentId:en.enrollmentId,expiresAt,scopes:Object.freeze(["trust:evaluation:portal"])});
  },
  async authenticate({token}={}){
   let p=tok(token),now=iso(clock(),"clock()"),st=await store.read(),r=st.collections?.[S]?.[p.sessionId]??null;
   if(!r||r.status!=="active"||!eq(r.tokenDigest,dig(p.token))||Date.parse(now)>=Date.parse(r.expiresAt))err("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED","invalid or expired");
   let en=await enrollment(r.organizationId);
   if(en.enrollmentId!==r.enrollmentId||en.recipientKeyFingerprint!==r.recipientKeyFingerprint)err("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED","enrollment changed");
   return Object.freeze({role:"evaluation_portal",principal:Object.freeze({id:r.sessionId,organizationId:r.organizationId,enrollmentId:r.enrollmentId,recipientKeyFingerprint:r.recipientKeyFingerprint,scopes:Object.freeze([...r.scopes]),status:"active"}),expiresAt:r.expiresAt});
  },
  async revoke({token}={}){
   let p=tok(token),now=iso(clock(),"clock()");
   let c=await store.transaction(tx=>{let r=tx.get(S,p.sessionId);if(!r||r.status!=="active"||!eq(r.tokenDigest,dig(p.token)))err("TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED","invalid");let n=Object.freeze({...r,status:"revoked",revokedAt:now});tx.put(S,p.sessionId,n);return n});
   return Object.freeze({sessionId:c.result.sessionId,revoked:true,revokedAt:c.result.revokedAt});
  }
 });
}
