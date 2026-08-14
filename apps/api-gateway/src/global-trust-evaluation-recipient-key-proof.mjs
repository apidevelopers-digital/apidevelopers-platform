import {constants,createHash,createPublicKey,randomBytes,verify} from "node:crypto";
export const TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION="trust-evaluation-recipient-key-proof/v1";
export const TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM="RSA-PSS-SHA256";
const COL="trust.evaluation.recipient_key_challenges";
function err(code,msg,cause){const e=new Error(msg);e.code=code;if(cause!==undefined)e.cause=cause;throw e}
function txt(v,n){const s=String(v??"").trim();if(!s)err("TRUST_EVALUATION_KEY_PROOF_INVALID_INPUT",`${n} is required`);return s}
function dec(v,n){const s=txt(v,n);if(!/^[A-Za-z0-9_-]+$/.test(s))err("TRUST_EVALUATION_KEY_PROOF_INVALID_ENCODING",`${n} must be canonical base64url`);const b=Buffer.from(s,"base64url");if(!b.length||b.toString("base64url")!==s)err("TRUST_EVALUATION_KEY_PROOF_INVALID_ENCODING",`${n} must be canonical base64url`);return b}
const enc=v=>Buffer.from(v).toString("base64url");
function key(v){if(typeof v==="string"&&v.includes("PRIVATE KEY"))err("TRUST_EVALUATION_KEY_PROOF_PRIVATE_KEY_REJECTED","private key rejected");let k;try{k=createPublicKey(v)}catch(c){err("TRUST_EVALUATION_KEY_PROOF_INVALID_PUBLIC_KEY","invalid public key",c)}if(k.asymmetricKeyType!=="rsa")err("TRUST_EVALUATION_KEY_PROOF_UNSUPPORTED_PUBLIC_KEY","RSA required");if(Number(k.asymmetricKeyDetails?.modulusLength??0)<2048)err("TRUST_EVALUATION_KEY_PROOF_WEAK_PUBLIC_KEY","RSA >= 2048 required");return k}
const fp=k=>createHash("sha256").update(k.export({type:"spki",format:"der"})).digest("base64url");
function iso(v,n){const s=txt(v,n);if(Number.isNaN(Date.parse(s)))err("TRUST_EVALUATION_KEY_PROOF_INVALID_TIME",`${n} invalid`);return s}
function ttl(v){const n=v??300000;if(!Number.isSafeInteger(n)||n<60000||n>900000)err("TRUST_EVALUATION_KEY_PROOF_INVALID_TTL","ttlMs must be integer 60000..900000");return n}
function core(x){return {version:TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION,algorithm:TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM,organizationId:txt(x.organizationId,"organizationId"),recipientKeyFingerprint:txt(x.recipientKeyFingerprint,"recipientKeyFingerprint"),challengeB64u:txt(x.challengeB64u,"challengeB64u"),issuedAt:iso(x.issuedAt,"issuedAt"),expiresAt:iso(x.expiresAt,"expiresAt"),correlationId:txt(x.correlationId,"correlationId")}}
const id=x=>createHash("sha256").update(JSON.stringify(x)).digest("base64url");
const payload=r=>Buffer.from(JSON.stringify({...core(r),challengeId:txt(r.challengeId,"challengeId")}));
const view=r=>Object.freeze({...core(r),challengeId:r.challengeId,signingPayloadB64u:enc(payload(r))});
export function createTrustEvaluationRecipientKeyProofService({store,clock=()=>new Date().toISOString(),randomBytesFn=randomBytes}={}){
 if(!store||typeof store.read!=="function"||typeof store.transaction!=="function")err("TRUST_EVALUATION_KEY_PROOF_INVALID_STORE","store read/transaction required");
 if(typeof clock!=="function"||typeof randomBytesFn!=="function")err("TRUST_EVALUATION_KEY_PROOF_INVALID_DEPENDENCY","clock/randomBytesFn required");
 return Object.freeze({
  async issueChallenge({organizationId,recipientPublicKey,correlationId,ttlMs}={}){
   const k=key(recipientPublicKey),issuedAt=iso(clock(),"clock"),expiresAt=new Date(Date.parse(issuedAt)+ttl(ttlMs)).toISOString(),nonce=Buffer.from(randomBytesFn(32));
   if(nonce.length<32)err("TRUST_EVALUATION_KEY_PROOF_WEAK_CHALLENGE","32 random bytes required");
   const s=core({organizationId,recipientKeyFingerprint:fp(k),challengeB64u:enc(nonce),issuedAt,expiresAt,correlationId}),challengeId=id(s),r={...s,challengeId,status:"active",consumedAt:null,verification:null};
   const c=await store.transaction(tx=>{if(tx.get(COL,challengeId))err("TRUST_EVALUATION_KEY_PROOF_CHALLENGE_CONFLICT","challenge exists");tx.put(COL,challengeId,r,{ifAbsent:true});return r});
   return view(c.result);
  },
  async verifyAndConsume({challengeId,recipientPublicKey,signatureB64u}={}){
   const cid=txt(challengeId,"challengeId"),k=key(recipientPublicKey),fingerprint=fp(k),sig=dec(signatureB64u,"signatureB64u"),verifiedAt=iso(clock(),"clock");
   const c=await store.transaction(tx=>{
    const r=tx.get(COL,cid);
    if(!r)err("TRUST_EVALUATION_KEY_PROOF_CHALLENGE_NOT_FOUND","challenge not found");
    if(r.status!=="active")err("TRUST_EVALUATION_KEY_PROOF_REPLAY","challenge already consumed");
    if(Date.parse(verifiedAt)>=Date.parse(r.expiresAt))err("TRUST_EVALUATION_KEY_PROOF_EXPIRED","challenge expired");
    if(r.recipientKeyFingerprint!==fingerprint)err("TRUST_EVALUATION_KEY_PROOF_RECIPIENT_MISMATCH","public key mismatch");
    if(!verify("sha256",payload(r),{key:k,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32},sig))err("TRUST_EVALUATION_KEY_PROOF_INVALID_SIGNATURE","invalid signature");
    const proof=Object.freeze({version:TRUST_EVALUATION_RECIPIENT_KEY_PROOF_VERSION,algorithm:TRUST_EVALUATION_RECIPIENT_KEY_PROOF_ALGORITHM,challengeId:r.challengeId,organizationId:r.organizationId,recipientKeyFingerprint:fingerprint,correlationId:r.correlationId,verifiedAt,keyPossessionVerified:true,identityVerified:false});
    tx.put(COL,cid,{...r,status:"consumed",consumedAt:verifiedAt,verification:{keyPossessionVerified:true,identityVerified:false,verifiedAt}});
    return proof;
   });
   return c.result;
  }
 });
}
