import { createHash } from "node:crypto";
import { assertEnrollmentManifest } from "./enrollment-manifest-v1.mjs";

const POLICY = Object.freeze({
  mode:"simulation-lab-only", metadataOnly:true, templatePayloadPersisted:false,
  rawBiometricsRetained:false, rawEmbeddingsRetained:false,
  rawBiometricPayloadAccepted:false, rawEmbeddingAccepted:false,
  ciphertextAccepted:false, keyMaterialAccepted:false, secretMaterialAccepted:false,
  kmsMaterialAccepted:false, encryptionPerformed:false, keyReferenceOpaque:true,
  immutableReceipt:true, hardDeleteAllowed:false, templateDeletionPerformed:false,
  revocationEnforced:false, realVaultReady:false, realEnrollmentReady:false,
  productionReady:false, biometricClaimReady:false,
});
export const TRUST_FACE_TEMPLATE_VAULT_RECEIPT_V1 = Object.freeze({
  version:"trust-face-template-vault-receipt/v1",
  purpose:"record-simulated-governed-template-storage",
  collection:"trust-face-template-vault-receipts-v1",
  idField:"vaultReceiptId",
  ...POLICY,
});
const P=TRUST_FACE_TEMPLATE_VAULT_RECEIPT_V1;
const INPUT=new Set(["vaultReceiptId","enrollmentManifest","envelopeMetadata","auditDigest","recordedAt"]);
const ENV=new Set(["envelopeRef","keyRef","encryptionAlgorithm","createdAt"]);
const ENV_RECEIPT=new Set(["version","envelopeRef","keyRef","encryptionAlgorithm","createdAt","algorithmDeclaredOnly","keyReferenceOpaque","encryptionPerformed"]);
const FORBIDDEN=new Set([
  "image","imageData","rawImage","pixels","video","videoData","frames","bytes","buffer",
  "embedding","embeddings","vector","vectors","template","biometricTemplate","templatePayload",
  "ciphertext","encryptedPayload","encryptedTemplate","payload","key","keyMaterial","kmsMaterial",
  "secret","secretMaterial","privateKey","plaintext",
]);

export class TrustFaceTemplateVaultReceiptV1Error extends Error {
  constructor(code,message){super(message);this.name="TrustFaceTemplateVaultReceiptV1Error";this.code=code;}
}
const fail=(code,message)=>{throw new TrustFaceTemplateVaultReceiptV1Error(code,message);};
const text=(value,field)=>{
  if(typeof value!=="string"||!value.trim()) fail("invalid_template_vault_field",`${field} is required`);
  return value.trim();
};
const digest=(value,field)=>{
  const v=text(value,field).toLowerCase();
  if(!/^sha256:[0-9a-f]{64}$/.test(v)) fail("invalid_template_vault_digest",`${field} must be sha256:<64 hex>`);
  return v;
};
const iso=(value,field)=>{
  const v=text(value,field),ms=Date.parse(v);
  if(!Number.isFinite(ms)) fail("invalid_template_vault_time",`${field} must be ISO-8601`);
  return Object.freeze({iso:new Date(ms).toISOString(),ms});
};
const stable=(v)=>Array.isArray(v)?`[${v.map(stable).join(",")}]`:v&&typeof v==="object"
  ?`{${Object.keys(v).sort().map(k=>`${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`:JSON.stringify(v);
const sha256=(v)=>`sha256:${createHash("sha256").update(stable(v)).digest("hex")}`;
function object(v,field){
  if(!v||typeof v!=="object"||Array.isArray(v)||ArrayBuffer.isView(v)) fail("invalid_template_vault_object",`${field} must be an object`);
  return v;
}
function noPayload(v,path="input",seen=new Set()){
  if(v===null||v===undefined||typeof v!=="object") return;
  if(ArrayBuffer.isView(v)||v instanceof ArrayBuffer) fail("raw_template_vault_payload_forbidden",`${path} binary payload is forbidden`);
  if(seen.has(v)) fail("invalid_template_vault_object",`${path} must not contain circular references`);
  seen.add(v);
  if(Array.isArray(v)) v.forEach((x,i)=>noPayload(x,`${path}[${i}]`,seen));
  else for(const [k,x] of Object.entries(v)){if(FORBIDDEN.has(k)) fail("raw_template_vault_payload_forbidden",`${path}.${k} is forbidden`);noPayload(x,`${path}.${k}`,seen);}
  seen.delete(v);
}
function exact(v,allowed,field){for(const k of Object.keys(v)) if(!allowed.has(k)) fail("unsupported_template_vault_field",`${field}.${k} is not supported in v1`);}
function opaque(v,field,prefix){
  const n=text(v,field);
  if(!n.startsWith(prefix)||n.length===prefix.length||/\s/.test(n)) fail("non_opaque_template_vault_reference",`${field} must use ${prefix}<opaque-id>`);
  return n;
}
function envelope(input){
  object(input,"envelopeMetadata");noPayload(input,"envelopeMetadata");exact(input,ENV,"envelopeMetadata");
  return Object.freeze({
    version:"trust-face-template-envelope-metadata/v1",
    envelopeRef:opaque(input.envelopeRef,"envelopeMetadata.envelopeRef","opaque-envelope-ref:"),
    keyRef:opaque(input.keyRef,"envelopeMetadata.keyRef","opaque-key-ref:"),
    encryptionAlgorithm:text(input.encryptionAlgorithm,"envelopeMetadata.encryptionAlgorithm"),
    createdAt:iso(input.createdAt,"envelopeMetadata.createdAt").iso,
    algorithmDeclaredOnly:true,keyReferenceOpaque:true,encryptionPerformed:false,
  });
}
function body(v){return Object.freeze({
  version:P.version,purpose:P.purpose,vaultReceiptId:v.vaultReceiptId,
  enrollmentId:v.manifest.enrollmentId,enrollmentManifestDigest:v.manifest.manifestDigest,
  templateRef:v.manifest.templateRef,templateDigest:v.manifest.templateDigest,
  envelopeMetadata:v.envelopeMetadata,consentLedgerDigest:v.manifest.consentLedgerDigest,
  enrollmentAuthorizationDigest:v.manifest.authorizationDigest,auditDigest:v.auditDigest,
  lifecycleState:"active",recordedAt:v.recordedAt,...POLICY,
});}

export function createTemplateVaultReceipt(input={}){
  object(input,"input");noPayload(input);exact(input,INPUT,"input");
  const recorded=iso(input.recordedAt,"recordedAt");
  const manifest=assertEnrollmentManifest({manifest:input.enrollmentManifest,now:recorded.iso});
  const meta=envelope(input.envelopeMetadata);
  if(iso(meta.createdAt,"envelopeMetadata.createdAt").ms>recorded.ms) fail("template_vault_envelope_from_future","envelopeMetadata.createdAt cannot be after recordedAt");
  const b=body({vaultReceiptId:text(input.vaultReceiptId,"vaultReceiptId"),manifest,envelopeMetadata:meta,auditDigest:digest(input.auditDigest,"auditDigest"),recordedAt:recorded.iso});
  return Object.freeze({...b,receiptDigest:sha256(b)});
}

export function assertTemplateVaultReceipt({receipt,enrollmentManifest,now=null}={}){
  object(receipt,"receipt");noPayload(receipt,"receipt");
  if(receipt.version!==P.version||receipt.purpose!==P.purpose||receipt.lifecycleState!=="active") fail("template_vault_receipt_contract_mismatch","receipt contract/version/state mismatch");
  for(const [field,expected] of Object.entries(POLICY)) if(receipt[field]!==expected) fail("template_vault_receipt_policy_mismatch",`receipt ${field} mismatch`);
  const current=now===null?null:iso(now,"now");
  const manifest=assertEnrollmentManifest({manifest:enrollmentManifest,now:current?.iso??receipt.recordedAt});
  const recorded=iso(receipt.recordedAt,"receipt.recordedAt");
  if(current&&recorded.ms>current.ms) fail("template_vault_receipt_from_future","receipt recordedAt is after now");
  object(receipt.envelopeMetadata,"receipt.envelopeMetadata");exact(receipt.envelopeMetadata,ENV_RECEIPT,"receipt.envelopeMetadata");
  if(receipt.envelopeMetadata.version!=="trust-face-template-envelope-metadata/v1"||receipt.envelopeMetadata.algorithmDeclaredOnly!==true||receipt.envelopeMetadata.keyReferenceOpaque!==true||receipt.envelopeMetadata.encryptionPerformed!==false)
    fail("template_vault_envelope_policy_mismatch","receipt envelope metadata policy mismatch");
  const meta=envelope({
    envelopeRef:receipt.envelopeMetadata.envelopeRef,keyRef:receipt.envelopeMetadata.keyRef,
    encryptionAlgorithm:receipt.envelopeMetadata.encryptionAlgorithm,createdAt:receipt.envelopeMetadata.createdAt,
  });
  if(iso(meta.createdAt,"receipt.envelopeMetadata.createdAt").ms>recorded.ms) fail("template_vault_envelope_from_future","receipt envelope createdAt cannot be after recordedAt");
  const expected=body({vaultReceiptId:text(receipt.vaultReceiptId,"receipt.vaultReceiptId"),manifest,envelopeMetadata:meta,auditDigest:digest(receipt.auditDigest,"receipt.auditDigest"),recordedAt:recorded.iso});
  for(const [field,value] of Object.entries(expected)) if(stable(receipt[field])!==stable(value)) fail(`template_vault_receipt_${field}_mismatch`,`receipt ${field} mismatch`);
  exact(receipt,new Set([...Object.keys(expected),"receiptDigest"]),"receipt");
  const expectedDigest=sha256(expected);
  if(receipt.receiptDigest!==expectedDigest) fail("template_vault_receipt_digest_mismatch","receipt digest mismatch");
  return Object.freeze({valid:true,vaultReceiptId:expected.vaultReceiptId,enrollmentId:manifest.enrollmentId,receiptDigest:expectedDigest,...POLICY});
}

export function createTemplateVaultReceiptPersistence({enrollmentRepository,receiptRepository}={}){
  if(!enrollmentRepository||typeof enrollmentRepository.getById!=="function") fail("invalid_template_vault_enrollment_repository","enrollmentRepository must provide getById");
  if(!receiptRepository||typeof receiptRepository.create!=="function"||typeof receiptRepository.getById!=="function"||typeof receiptRepository.list!=="function")
    fail("invalid_template_vault_receipt_repository","receiptRepository must provide create, getById and list");
  const validate=async(receipt,now)=>{
    const manifest=await enrollmentRepository.getById(receipt?.enrollmentId);
    if(manifest===null) fail("orphan_template_vault_receipt","receipt references a missing enrollment manifest");
    assertTemplateVaultReceipt({receipt,enrollmentManifest:manifest,now});return receipt;
  };
  return Object.freeze({
    version:"trust-face-template-vault-receipt-persistence/v1",collection:P.collection,idField:P.idField,
    repositoryContract:"create/getById/list",...POLICY,
    async recordReceipt({enrollmentId,vaultReceiptId,envelopeMetadata,auditDigest,recordedAt}={}){
      const manifest=await enrollmentRepository.getById(text(enrollmentId,"enrollmentId"));
      if(manifest===null) fail("enrollment_not_found","enrollment manifest was not found");
      const receipt=createTemplateVaultReceipt({vaultReceiptId,enrollmentManifest:manifest,envelopeMetadata,auditDigest,recordedAt});
      return validate(await receiptRepository.create(receipt),recordedAt);
    },
    async getReceipt(vaultReceiptId,{now=null}={}){
      const receipt=await receiptRepository.getById(text(vaultReceiptId,"vaultReceiptId"));
      return receipt===null?null:validate(receipt,now);
    },
    async listReceipts({enrollmentId=null,now=null}={}){
      const records=await receiptRepository.list({where:enrollmentId===null?{}:{enrollmentId:text(enrollmentId,"enrollmentId")}});
      if(!Array.isArray(records)) fail("invalid_template_vault_receipt_repository_result","receiptRepository.list must return an array");
      const out=[];for(const receipt of records) out.push(await validate(receipt,now));return Object.freeze(out);
    },
  });
}
