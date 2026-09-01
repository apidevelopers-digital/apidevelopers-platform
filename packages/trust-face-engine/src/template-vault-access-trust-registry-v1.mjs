import { createHash, createPublicKey } from "node:crypto";
import { createCryptographicallyVerifiedTemplateVaultReceiptAccess } from "./template-vault-access-proof-v1.mjs";

export const TRUST_FACE_TEMPLATE_VAULT_ACCESS_TRUST_REGISTRY_V1 = Object.freeze({
  version:"trust-face-template-vault-access-trust-registry/v1", mode:"simulation-lab-only", algorithm:"Ed25519",
  appendOnlyKeyRegistration:true, appendOnlyRevocationLifecycle:true, publicKeyMaterialOnly:true,
  privateKeyAccepted:false, privateKeyStored:false, labTrustRegistryIntegrated:true,
  productionTrustRegistryIntegrated:false, productionKeyManagementIntegrated:false,
  externalAuthorizationIssuerIntegrated:false, externalRevocationAuthorityIntegrated:false,
  productionCryptographicAuthorizationProofVerified:false, realVaultAccessAuthorized:false,
  realVaultReady:false, productionReady:false, biometricClaimReady:false,
});
export class TrustFaceTemplateVaultAccessTrustRegistryV1Error extends Error {
  constructor(code,message){ super(message); this.name="TrustFaceTemplateVaultAccessTrustRegistryV1Error"; this.code=code; }
}
const fail=(code,message)=>{ throw new TrustFaceTemplateVaultAccessTrustRegistryV1Error(code,message); };
const req=(v,f)=>{ if(typeof v!=="string"||!v.trim()) fail("invalid_template_vault_access_trust_registry_field",`${f} is required`); return v.trim(); };
const time=(v,f)=>{ const s=req(v,f), ms=Date.parse(s); if(!Number.isFinite(ms)) fail("invalid_template_vault_access_trust_registry_time",`${f} must be ISO-8601`); return {iso:new Date(ms).toISOString(),ms}; };
const dg=(v,f)=>{ const s=req(v,f).toLowerCase(); if(!/^sha256:[0-9a-f]{64}$/.test(s)) fail("invalid_template_vault_access_trust_registry_digest",`${f} must be sha256:<64 hex>`); return s; };
const sha=(v)=>`sha256:${createHash("sha256").update(v).digest("hex")}`;
const hashRecord=(v)=>sha(JSON.stringify(v));
const reasons=new Set(["key-compromise","key-rotation","operator-request","policy-change"]);
const repo=(r,n)=>{ if(!r||["create","getById","list"].some(m=>typeof r[m]!=="function")) fail(`invalid_${n}_repository`,`${n}Repository must provide create, getById and list`); };

function keyRecord(i={}){
  const keyId=req(i.keyId,"keyId"), pem=req(i.publicKeyPem,"publicKeyPem");
  if(/PRIVATE KEY/.test(pem)) fail("template_vault_access_trust_registry_private_key_forbidden","private keys are forbidden");
  let key; try{ key=createPublicKey(pem); }catch{ fail("invalid_template_vault_access_trust_registry_public_key","invalid public key"); }
  if(key.asymmetricKeyType!=="ed25519") fail("invalid_template_vault_access_trust_registry_algorithm","publicKeyPem must be Ed25519");
  const from=time(i.validFrom,"validFrom"), until=time(i.validUntil,"validUntil"), at=time(i.registeredAt,"registeredAt");
  if(until.ms<=from.ms) fail("invalid_template_vault_access_trust_registry_window","validUntil must be after validFrom");
  if(at.ms<from.ms||at.ms>=until.ms) fail("invalid_template_vault_access_trust_registry_registration_time","registeredAt must be inside validity window");
  const publicKeyPem=key.export({type:"spki",format:"pem"}).toString();
  const keyFingerprint=sha(key.export({type:"spki",format:"der"}));
  const body={version:"trust-face-template-vault-access-trusted-public-key/v1",keyId,algorithm:"Ed25519",publicKeyPem,keyFingerprint,
    validFrom:from.iso,validUntil:until.iso,registeredAt:at.iso,registrationEvidenceDigest:dg(i.registrationEvidenceDigest,"registrationEvidenceDigest"),
    privateKeyStored:false,productionTrustRegistryIntegrated:false};
  return Object.freeze({...body,registrationDigest:hashRecord(body)});
}
function checkedKey(r){
  if(!r||typeof r!=="object") fail("invalid_template_vault_access_trust_registry_record","invalid trusted key record");
  const b=keyRecord(r);
  if(r.keyFingerprint!==b.keyFingerprint||r.registrationDigest!==b.registrationDigest)
    fail("template_vault_access_trust_registry_record_tampered","trusted key record integrity mismatch");
  return b;
}
function revocation(k,i={}){
  const reason=req(i.reasonCode,"reasonCode"); if(!reasons.has(reason)) fail("invalid_template_vault_access_trust_registry_revocation_reason","reasonCode is not allowed");
  const at=time(i.revokedAt,"revokedAt"), from=time(k.validFrom,"validFrom"); if(at.ms<from.ms) fail("invalid_template_vault_access_trust_registry_revocation_time","revokedAt cannot precede validFrom");
  const body={version:"trust-face-template-vault-access-trusted-key-revocation/v1",keyId:k.keyId,keyFingerprint:k.keyFingerprint,
    registrationDigest:k.registrationDigest,reasonCode:reason,revokedAt:at.iso,revocationEvidenceDigest:dg(i.revocationEvidenceDigest,"revocationEvidenceDigest"),
    physicalKeyDeletionPerformed:false,productionTrustRegistryIntegrated:false};
  return Object.freeze({...body,revocationDigest:hashRecord(body)});
}
function checkedRev(r,k){
  if(r==null) return null;
  const b=revocation(k,r);
  if(r.keyId!==k.keyId||r.keyFingerprint!==k.keyFingerprint||r.registrationDigest!==k.registrationDigest||r.revocationDigest!==b.revocationDigest)
    fail("template_vault_access_trust_registry_revocation_tampered","trusted key revocation integrity mismatch");
  return b;
}

export function createTemplateVaultAccessTrustRegistry({keyRepository,revocationRepository}={}){
  repo(keyRepository,"trusted_key"); repo(revocationRepository,"trusted_key_revocation");
  return Object.freeze({...TRUST_FACE_TEMPLATE_VAULT_ACCESS_TRUST_REGISTRY_V1,
    async registerTrustedPublicKey(input={}){
      const r=keyRecord(input); if(await keyRepository.getById(r.keyId)) fail("template_vault_access_trust_registry_key_conflict","keyId already registered");
      return checkedKey(await keyRepository.create(r));
    },
    async revokeTrustedPublicKey(input={}){
      const keyId=req(input.keyId,"keyId"), stored=await keyRepository.getById(keyId);
      if(!stored) fail("template_vault_access_trust_registry_key_not_found","trusted key not found");
      const k=checkedKey(stored); if(await revocationRepository.getById(keyId)) fail("template_vault_access_trust_registry_revocation_conflict","trusted key already revoked");
      return checkedRev(await revocationRepository.create(revocation(k,input)),k);
    },
    async resolveTrustedPublicKey(keyId,{now}={}){
      keyId=req(keyId,"keyId"); const current=time(now,"now"), stored=await keyRepository.getById(keyId);
      if(!stored) fail("template_vault_access_trust_registry_key_not_found","trusted key not found");
      const k=checkedKey(stored), from=time(k.validFrom,"validFrom"), until=time(k.validUntil,"validUntil");
      if(current.ms<from.ms||current.ms>=until.ms) fail("template_vault_access_trust_registry_key_not_active","trusted key outside validity window");
      const rv=checkedRev(await revocationRepository.getById(keyId),k);
      if(rv&&current.ms>=time(rv.revokedAt,"revokedAt").ms) fail("template_vault_access_trust_registry_key_revoked","trusted key is revoked");
      return Object.freeze({version:"trust-face-template-vault-access-trusted-public-key-resolution/v1",keyId:k.keyId,algorithm:"Ed25519",
        publicKeyPem:k.publicKeyPem,keyFingerprint:k.keyFingerprint,registrationDigest:k.registrationDigest,activeAt:current.iso,
        labTrustRegistryIntegrated:true,productionTrustRegistryIntegrated:false,productionReady:false});
    },
    async getKeyLifecycleSnapshot(keyId,{now}={}){
      keyId=req(keyId,"keyId"); const current=time(now,"now"), stored=await keyRepository.getById(keyId); if(!stored) return null;
      const k=checkedKey(stored), from=time(k.validFrom,"validFrom"), until=time(k.validUntil,"validUntil");
      const rv=checkedRev(await revocationRepository.getById(keyId),k), revoked=rv&&current.ms>=time(rv.revokedAt,"revokedAt").ms;
      return Object.freeze({version:"trust-face-template-vault-access-trusted-key-lifecycle-snapshot/v1",keyId,
        keyFingerprint:k.keyFingerprint,registrationDigest:k.registrationDigest,state:revoked?"revoked":current.ms>=from.ms&&current.ms<until.ms?"active":"inactive",
        revocationDigest:rv?.revocationDigest??null,revokedAt:rv?.revokedAt??null,privateKeyStored:false,productionTrustRegistryIntegrated:false,productionReady:false});
    },
  });
}

export function createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess({authorizedReceiptAccess,trustRegistry}={}){
  if(!trustRegistry||typeof trustRegistry.resolveTrustedPublicKey!=="function") fail("invalid_template_vault_access_trust_registry","trustRegistry must provide resolveTrustedPublicKey");
  return Object.freeze({version:"trust-face-template-vault-access-registry-backed-proof/v1",mode:"simulation-lab-only",
    labTrustRegistryIntegrated:true,productionTrustRegistryIntegrated:false,productionKeyManagementIntegrated:false,
    externalAuthorizationIssuerIntegrated:false,realVaultAccessAuthorized:false,realVaultReady:false,productionReady:false,biometricClaimReady:false,
    async getRegistryBackedCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId,authorization,proof,purposeCode,now}={}){
      const resolved=await trustRegistry.resolveTrustedPublicKey(req(proof?.keyId,"proof.keyId"),{now});
      const verifier=createCryptographicallyVerifiedTemplateVaultReceiptAccess({authorizedReceiptAccess,trustedPublicKeys:{[resolved.keyId]:resolved.publicKeyPem}});
      const result=await verifier.getCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId,authorization,proof,purposeCode,now});
      return Object.freeze({...result,trustedKey:Object.freeze({keyId:resolved.keyId,keyFingerprint:resolved.keyFingerprint,registrationDigest:resolved.registrationDigest}),
        labTrustRegistryIntegrated:true,productionTrustRegistryIntegrated:false,productionReady:false});
    },
  });
}
