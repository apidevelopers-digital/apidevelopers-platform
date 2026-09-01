import { createPublicKey, verify } from "node:crypto";
export const TRUST_FACE_TEMPLATE_VAULT_ACCESS_PROOF_V1 = Object.freeze({
  version:"trust-face-template-vault-access-proof/v1", purpose:"verify-lab-detached-signature-over-template-vault-access-authorization-digest",
  mode:"simulation-lab-only", algorithm:"Ed25519", signedMessage:"authorizationDigest",
  trustedPublicKeyInjectedAtRuntime:true, privateKeyAccepted:false, privateKeyStored:false,
  externalAuthorizationIssuerIntegrated:false, productionTrustRegistryIntegrated:false,
  cryptographicAuthorizationProofVerifiedInLab:true, productionCryptographicAuthorizationProofVerified:false,
  realVaultAccessAuthorized:false, realVaultReady:false, productionReady:false, biometricClaimReady:false,
});
export class TrustFaceTemplateVaultAccessProofV1Error extends Error { constructor(code,message){ super(message); this.name="TrustFaceTemplateVaultAccessProofV1Error"; this.code=code; } }
const fail=(code,message)=>{ throw new TrustFaceTemplateVaultAccessProofV1Error(code,message); };
const required=(value,field)=>{ if(typeof value!=="string"||!value.trim()) fail("invalid_template_vault_access_proof_field",`${field} is required`); return value.trim(); };
const digest=(value,field)=>{ const n=required(value,field).toLowerCase(); if(!/^sha256:[0-9a-f]{64}$/.test(n)) fail("invalid_template_vault_access_proof_digest",`${field} must be sha256:<64 hex>`); return n; };
const signature=(value)=>{ const n=required(value,"proof.signature"); if(!/^[A-Za-z0-9+/]+={0,2}$/.test(n)) fail("invalid_template_vault_access_proof_signature","proof.signature must be base64"); const b=Buffer.from(n,"base64"); if(b.length!==64||b.toString("base64")!==n) fail("invalid_template_vault_access_proof_signature","proof.signature must be canonical Ed25519 base64"); return b; };
const publicKey=(value)=>{ const pem=required(value,"trustedPublicKeyPem"); if(/PRIVATE KEY/.test(pem)) fail("template_vault_access_proof_private_key_forbidden","private keys are forbidden"); let key; try{ key=createPublicKey(pem); }catch{ fail("invalid_template_vault_access_proof_public_key","trustedPublicKeyPem is not a valid public key"); } if(key.asymmetricKeyType!=="ed25519") fail("invalid_template_vault_access_proof_algorithm","trustedPublicKeyPem must be Ed25519"); return key; };
export function verifyLabTemplateVaultAccessAuthorizationProof({authorization,proof,trustedPublicKeyPem,trustedKeyId}={}){
 if(!authorization||typeof authorization!=="object"||Array.isArray(authorization)) fail("template_vault_access_authorization_object_required","authorization object is required");
 if(!proof||typeof proof!=="object"||Array.isArray(proof)) fail("template_vault_access_proof_object_required","proof object is required");
 const expectedKeyId=required(trustedKeyId,"trustedKeyId"); const proofKeyId=required(proof.keyId,"proof.keyId");
 if(proofKeyId!==expectedKeyId) fail("template_vault_access_proof_key_id_mismatch","proof keyId does not match trustedKeyId");
 if(proof.algorithm!=="Ed25519") fail("invalid_template_vault_access_proof_algorithm","proof.algorithm must be Ed25519");
 if(proof.signedMessage!=="authorizationDigest") fail("template_vault_access_proof_message_mismatch","proof.signedMessage must be authorizationDigest");
 const authorizationDigest=digest(authorization.authorizationDigest,"authorization.authorizationDigest");
 const signedDigest=digest(proof.authorizationDigest,"proof.authorizationDigest");
 if(signedDigest!==authorizationDigest) fail("template_vault_access_proof_digest_mismatch","proof authorizationDigest does not match authorization");
 const key=publicKey(trustedPublicKeyPem); const sig=signature(proof.signature);
 if(!verify(null,Buffer.from(authorizationDigest,"utf8"),key,sig)) fail("template_vault_access_proof_signature_invalid","Ed25519 signature verification failed");
 return Object.freeze({verified:true,proofVersion:TRUST_FACE_TEMPLATE_VAULT_ACCESS_PROOF_V1.version,mode:TRUST_FACE_TEMPLATE_VAULT_ACCESS_PROOF_V1.mode,algorithm:"Ed25519",signedMessage:"authorizationDigest",trustedKeyId:expectedKeyId,authorizationDigest,cryptographicAuthorizationProofVerifiedInLab:true,externalAuthorizationIssuerIntegrated:false,productionTrustRegistryIntegrated:false,productionCryptographicAuthorizationProofVerified:false,realVaultAccessAuthorized:false,realVaultReady:false,productionReady:false,biometricClaimReady:false});
}
export function createCryptographicallyVerifiedTemplateVaultReceiptAccess({authorizedReceiptAccess,trustedPublicKeys}={}){
 if(!authorizedReceiptAccess||typeof authorizedReceiptAccess.getAuthorizedReceipt!=="function") fail("invalid_template_vault_authorized_receipt_access","authorizedReceiptAccess must provide getAuthorizedReceipt");
 if(!trustedPublicKeys||typeof trustedPublicKeys!=="object"||Array.isArray(trustedPublicKeys)) fail("invalid_template_vault_access_proof_trust_registry","trustedPublicKeys map is required");
 return Object.freeze({...TRUST_FACE_TEMPLATE_VAULT_ACCESS_PROOF_V1, async getCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId,authorization,proof,purposeCode,now}={}){
   const keyId=required(proof?.keyId,"proof.keyId"); const trustedPublicKeyPem=trustedPublicKeys[keyId];
   if(typeof trustedPublicKeyPem!=="string"||!trustedPublicKeyPem.trim()) fail("template_vault_access_proof_untrusted_key","proof keyId is not trusted");
   const access=await authorizedReceiptAccess.getAuthorizedReceipt({vaultReceiptId,authorization,purposeCode,now});
   const verification=verifyLabTemplateVaultAccessAuthorizationProof({authorization,proof,trustedPublicKeyPem,trustedKeyId:keyId});
   return Object.freeze({...access,cryptographicProof:verification,cryptographicAuthorizationProofVerifiedInLab:true,externalAuthorizationIssuerIntegrated:false,productionTrustRegistryIntegrated:false,productionCryptographicAuthorizationProofVerified:false,realVaultAccessAuthorized:false,realVaultReady:false,productionReady:false,biometricClaimReady:false});
 }});
}
