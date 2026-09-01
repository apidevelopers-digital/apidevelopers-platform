import{createHash}from"node:crypto";
import{assertEnrollmentManifest}from"./enrollment-manifest-v1.mjs";

const P=Object.freeze({
 version:"trust-face-enrollment-revocation/v1",purpose:"revoke-governed-enrollment-manifest",
 collection:"trust-face-enrollment-revocations-v1",idField:"enrollmentId",
 allowedReasonCodes:Object.freeze(["consent-withdrawn","subject-request","security-response","superseded","administrative-policy"]),
 appendOnly:true,hardDeleteAllowed:false,enrollmentMutationAllowed:false,templateDeletionPerformed:false,
 templatePayloadPersisted:false,rawBiometricsRetained:false,rawEmbeddingsRetained:false,
 authorizationRequired:true,realEnrollmentReady:false,productionReady:false,biometricClaimReady:false
});
export const TRUST_FACE_ENROLLMENT_REVOCATION_V1=P;
const RAW=["image","imageData","rawImage","pixels","video","videoData","frames","bytes","buffer","embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload"];
const POL=Object.freeze({appendOnly:true,hardDeleteAllowed:false,enrollmentMutationAllowed:false,templateDeletionPerformed:false,templatePayloadPersisted:false,rawBiometricsRetained:false,rawEmbeddingsRetained:false,authorizationRequired:true,realEnrollmentReady:false,productionReady:false,biometricClaimReady:false});
export class TrustFaceEnrollmentRevocationV1Error extends Error{constructor(code,message){super(message);this.name="TrustFaceEnrollmentRevocationV1Error";this.code=code}}
const F=(c,m)=>{throw new TrustFaceEnrollmentRevocationV1Error(c,m)};
const T=(v,f)=>{if(typeof v!=="string"||!v.trim())F("invalid_enrollment_revocation_field",`${f} is required`);return v.trim()};
const D=(v,f)=>{v=T(v,f).toLowerCase();if(!/^sha256:[0-9a-f]{64}$/.test(v))F("invalid_enrollment_revocation_digest",`${f} must be sha256:<64 hex>`);return v};
const I=(v,f)=>{v=T(v,f);const ms=Date.parse(v);if(!Number.isFinite(ms))F("invalid_enrollment_revocation_time",`${f} must be ISO-8601`);return{iso:new Date(ms).toISOString(),ms}};
const S=v=>Array.isArray(v)?`[${v.map(S).join(",")}]`:v&&typeof v==="object"?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${S(v[k])}`).join(",")}}`:JSON.stringify(v);
const H=v=>`sha256:${createHash("sha256").update(S(v)).digest("hex")}`;
const R=v=>{v=T(v,"reasonCode");if(!P.allowedReasonCodes.includes(v))F("invalid_enrollment_revocation_reason","reasonCode is not allowed");return v};
function noRaw(i){if(!i||typeof i!=="object"||Array.isArray(i))F("enrollment_revocation_input_required","revocation input must be an object");for(const f of RAW)if(f in i)F("raw_enrollment_revocation_payload_forbidden",`${f} is forbidden`)}
const B=({enrollmentId,enrollmentManifestDigest,revocationAuthorizationDigest,reasonCode,revokedAt})=>Object.freeze({version:P.version,purpose:P.purpose,enrollmentId,enrollmentManifestDigest,revocationAuthorizationDigest,reasonCode,revokedAt,previousState:"active",nextState:"revoked",...POL});

export function createEnrollmentRevocation(i={}){
 noRaw(i);
 const b=B({enrollmentId:T(i.enrollmentId,"enrollmentId"),enrollmentManifestDigest:D(i.enrollmentManifestDigest,"enrollmentManifestDigest"),revocationAuthorizationDigest:D(i.revocationAuthorizationDigest,"revocationAuthorizationDigest"),reasonCode:R(i.reasonCode),revokedAt:I(i.revokedAt,"revokedAt").iso});
 return Object.freeze({...b,revocationDigest:H(b)});
}
export function assertEnrollmentRevocation({revocation:r,enrollmentManifest:m,now=null}={}){
 if(!r||typeof r!=="object"||Array.isArray(r))F("enrollment_revocation_required","revocation is required");
 if(r.version!==P.version)F("enrollment_revocation_version_mismatch","unsupported enrollment revocation version");
 if(r.purpose!==P.purpose)F("enrollment_revocation_purpose_mismatch","enrollment revocation purpose mismatch");
 if(r.previousState!=="active"||r.nextState!=="revoked")F("enrollment_revocation_state_mismatch","revocation must transition active to revoked");
 for(const[f,v]of Object.entries(POL))if(r[f]!==v)F("enrollment_revocation_policy_mismatch",`enrollment revocation ${f} mismatch`);
 const cm=assertEnrollmentManifest({manifest:m,now});
 const n={enrollmentId:T(r.enrollmentId,"revocation.enrollmentId"),enrollmentManifestDigest:D(r.enrollmentManifestDigest,"revocation.enrollmentManifestDigest"),revocationAuthorizationDigest:D(r.revocationAuthorizationDigest,"revocation.revocationAuthorizationDigest"),reasonCode:R(r.reasonCode),revokedAt:I(r.revokedAt,"revocation.revokedAt")};
 if(n.enrollmentId!==cm.enrollmentId)F("enrollment_revocation_enrollment_mismatch","revocation enrollmentId does not match enrollment manifest");
 if(n.enrollmentManifestDigest!==cm.manifestDigest)F("enrollment_revocation_manifest_digest_mismatch","revocation manifest digest does not match enrollment manifest");
 if(n.revokedAt.ms<I(cm.enrolledAt,"enrollmentManifest.enrolledAt").ms)F("enrollment_revocation_before_enrollment","revokedAt cannot be before enrolledAt");
 if(now!==null&&n.revokedAt.ms>I(now,"now").ms)F("enrollment_revocation_from_future","revokedAt is after now");
 const b=B({...n,revokedAt:n.revokedAt.iso});
 for(const[f,v]of Object.entries(b))if(S(r[f])!==S(v))F(`enrollment_revocation_${f}_mismatch`,`enrollment revocation ${f} mismatch`);
 const rd=H(b);if(r.revocationDigest!==rd)F("enrollment_revocation_digest_mismatch","enrollment revocation digest mismatch");
 return Object.freeze({valid:true,enrollmentId:n.enrollmentId,state:"revoked",enrollmentManifestDigest:n.enrollmentManifestDigest,revocationAuthorizationDigest:n.revocationAuthorizationDigest,reasonCode:n.reasonCode,revokedAt:n.revokedAt.iso,revocationDigest:rd,...POL});
}
function repos(e,r){if(!e||typeof e.getById!=="function")F("invalid_enrollment_repository","enrollmentRepository must provide getById");if(!r||typeof r.create!=="function"||typeof r.getById!=="function"||typeof r.list!=="function")F("invalid_enrollment_revocation_repository","revocationRepository must provide create, getById and list")}
export function createEnrollmentRevocationPersistence({enrollmentRepository:e,revocationRepository:r}={}){
 repos(e,r);
 return Object.freeze({
  version:"trust-face-enrollment-revocation-persistence/v1",collection:P.collection,idField:P.idField,
  appendOnly:true,hardDeleteAllowed:false,enrollmentMutationAllowed:false,templateDeletionPerformed:false,realEnrollmentReady:false,productionReady:false,biometricClaimReady:false,
  async revokeEnrollment({enrollmentId,revocationAuthorizationDigest,reasonCode,revokedAt}={}){
   const id=T(enrollmentId,"enrollmentId"),m=await e.getById(id);if(m===null)F("enrollment_not_found","enrollment was not found");
   const cm=assertEnrollmentManifest({manifest:m,now:revokedAt}),old=await r.getById(id);
   if(old!==null){assertEnrollmentRevocation({revocation:old,enrollmentManifest:m,now:null});F("enrollment_already_revoked","enrollment is already revoked")}
   const rv=createEnrollmentRevocation({enrollmentId:id,enrollmentManifestDigest:cm.manifestDigest,revocationAuthorizationDigest,reasonCode,revokedAt});
   let p;try{p=await r.create(rv)}catch(x){if(x?.code==="record_conflict"){const c=await r.getById(id);if(c!==null){assertEnrollmentRevocation({revocation:c,enrollmentManifest:m,now:null});F("enrollment_already_revoked","enrollment is already revoked")}}throw x}
   assertEnrollmentRevocation({revocation:p,enrollmentManifest:m,now:revokedAt});return p;
  },
  async getEnrollmentLifecycle(enrollmentId,{now=null}={}){
   const id=T(enrollmentId,"enrollmentId"),m=await e.getById(id);if(m===null)return null;
   const cm=assertEnrollmentManifest({manifest:m,now}),rv=await r.getById(id);
   if(rv===null)return Object.freeze({enrollmentId:id,state:"active",enrollmentManifestDigest:cm.manifestDigest,enrolledAt:cm.enrolledAt,revocationDigest:null,revokedAt:null,reasonCode:null,revocationAuthorizationDigest:null,hardDeleted:false,realEnrollmentReady:false,productionReady:false,biometricClaimReady:false});
   const c=assertEnrollmentRevocation({revocation:rv,enrollmentManifest:m,now});
   return Object.freeze({enrollmentId:id,state:"revoked",enrollmentManifestDigest:cm.manifestDigest,enrolledAt:cm.enrolledAt,revocationDigest:c.revocationDigest,revokedAt:c.revokedAt,reasonCode:c.reasonCode,revocationAuthorizationDigest:c.revocationAuthorizationDigest,hardDeleted:false,realEnrollmentReady:false,productionReady:false,biometricClaimReady:false});
  },
  async listRevocations({now=null}={}){
   const a=await r.list({where:{}});if(!Array.isArray(a))F("invalid_enrollment_revocation_repository_result","revocationRepository.list must return an array");
   const out=[];for(const rv of a){const m=await e.getById(rv?.enrollmentId);if(m===null)F("orphan_enrollment_revocation","revocation references a missing enrollment");assertEnrollmentRevocation({revocation:rv,enrollmentManifest:m,now});out.push(rv)}return Object.freeze([...out]);
  }
 });
}
