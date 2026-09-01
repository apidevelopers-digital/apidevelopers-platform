import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_TEMPLATE_VAULT_RECEIPT_V1 as PROFILE,
  TrustFaceTemplateVaultReceiptV1Error,
  createTemplateVaultReceipt,
  assertTemplateVaultReceipt,
  createTemplateVaultReceiptPersistence,
} from "../src/template-vault-receipt-v1.mjs";
import { createEnrollmentManifest } from "../src/enrollment-manifest-v1.mjs";

const d=(c)=>`sha256:${c.repeat(64)}`;
const manifest=(overrides={})=>createEnrollmentManifest({
  enrollmentId:"enrollment-001",subjectRef:"subject-ref-001",
  templateRef:"vault://trust-face/templates/template-001",templateDigest:d("1"),
  modelVersion:"trust-face-owned-embedding/v1",consentLedgerDigest:d("2"),
  authorizationDigest:d("3"),enrolledAt:"2026-09-01T04:00:00Z",...overrides,
});
const input=(overrides={})=>({
  vaultReceiptId:"vault-receipt-001",enrollmentManifest:manifest(),
  envelopeMetadata:{
    envelopeRef:"opaque-envelope-ref:trust-face/lab/envelope-001",
    keyRef:"opaque-key-ref:trust-face/lab/key-001",
    encryptionAlgorithm:"AES-256-GCM",createdAt:"2026-09-01T04:05:00Z",
  },
  auditDigest:d("4"),recordedAt:"2026-09-01T04:06:00Z",...overrides,
});
function repo(idField,initial=[]){
  const m=new Map(initial.map(v=>[v[idField],structuredClone(v)]));
  return {
    async create(v){const id=v[idField];if(m.has(id)){const e=new Error("record conflict");e.code="record_conflict";throw e;}m.set(id,structuredClone(v));return structuredClone(v);},
    async getById(id){return m.has(id)?structuredClone(m.get(id)):null;},
    async list({where={}}={}){return [...m.values()].filter(v=>Object.entries(where).every(([k,x])=>v[k]===x)).map(v=>structuredClone(v));},
    unsafeMutate(id,fn){fn(m.get(id));},
    unsafeDelete(id){m.delete(id);},
  };
}

test("profile remains simulation-only and non-production",()=>{
  assert.equal(PROFILE.mode,"simulation-lab-only");
  for(const field of ["templatePayloadPersisted","rawBiometricsRetained","rawEmbeddingsRetained","rawBiometricPayloadAccepted","rawEmbeddingAccepted","ciphertextAccepted","keyMaterialAccepted","secretMaterialAccepted","kmsMaterialAccepted","encryptionPerformed","hardDeleteAllowed","templateDeletionPerformed","revocationEnforced","realVaultReady","realEnrollmentReady","productionReady","biometricClaimReady"]) assert.equal(PROFILE[field],false);
  assert.equal(PROFILE.metadataOnly,true);assert.equal(PROFILE.keyReferenceOpaque,true);assert.equal(PROFILE.immutableReceipt,true);
});

test("receipt binds exact enrollment, consent and authorization metadata",()=>{
  const a=createTemplateVaultReceipt(input()),b=createTemplateVaultReceipt(input());
  assert.deepEqual(a,b);assert.equal(a.enrollmentId,"enrollment-001");
  assert.equal(a.enrollmentManifestDigest,input().enrollmentManifest.manifestDigest);
  assert.equal(a.templateRef,"vault://trust-face/templates/template-001");
  assert.equal(a.templateDigest,d("1"));assert.equal(a.consentLedgerDigest,d("2"));
  assert.equal(a.enrollmentAuthorizationDigest,d("3"));assert.equal(a.auditDigest,d("4"));
  assert.equal(a.lifecycleState,"active");assert.match(a.receiptDigest,/^sha256:[0-9a-f]{64}$/);
});

test("raw biometric, template, ciphertext, key and secret payloads fail closed",()=>{
  for(const [field,value] of [["image","x"],["embedding",[1]],["template","x"],["ciphertext","x"],["keyMaterial","x"],["secret","x"]]){
    assert.throws(()=>createTemplateVaultReceipt({...input(),envelopeMetadata:{...input().envelopeMetadata,nested:{[field]:value}}}),
      e=>e instanceof TrustFaceTemplateVaultReceiptV1Error&&e.code==="raw_template_vault_payload_forbidden");
  }
});

test("only opaque envelope/key references are accepted",()=>{
  assert.throws(()=>createTemplateVaultReceipt({...input(),envelopeMetadata:{...input().envelopeMetadata,keyRef:"kms-real-key"}}),e=>e?.code==="non_opaque_template_vault_reference");
  assert.throws(()=>createTemplateVaultReceipt({...input(),envelopeMetadata:{...input().envelopeMetadata,envelopeRef:"https://store/template"}}),e=>e?.code==="non_opaque_template_vault_reference");
  const r=createTemplateVaultReceipt(input());
  assert.equal(r.envelopeMetadata.algorithmDeclaredOnly,true);
  assert.equal(r.envelopeMetadata.keyReferenceOpaque,true);
  assert.equal(r.envelopeMetadata.encryptionPerformed,false);
});

test("future envelope and receipt times are rejected",()=>{
  assert.throws(()=>createTemplateVaultReceipt({...input(),recordedAt:"2026-09-01T04:04:00Z"}),e=>e?.code==="template_vault_envelope_from_future");
  const r=createTemplateVaultReceipt(input());
  assert.throws(()=>assertTemplateVaultReceipt({receipt:r,enrollmentManifest:input().enrollmentManifest,now:"2026-09-01T04:05:30Z"}),e=>e?.code==="template_vault_receipt_from_future");
});

test("receipt policy, binding, extra fields and digest tampering are rejected",()=>{
  const r=createTemplateVaultReceipt(input());
  for(const tampered of [
    {...r,productionReady:true},
    {...r,templateDigest:d("9")},
    {...r,receiptDigest:d("8")},
    {...r,unexpected:"x"},
    {...r,envelopeMetadata:{...r.envelopeMetadata,encryptionPerformed:true}},
  ]) assert.throws(()=>assertTemplateVaultReceipt({receipt:tampered,enrollmentManifest:input().enrollmentManifest,now:"2026-09-01T04:07:00Z"}));
});

test("persistence records, reads and filters while revalidating",async()=>{
  const m=manifest(),enroll=repo("enrollmentId",[m]),receipts=repo("vaultReceiptId");
  const p=createTemplateVaultReceiptPersistence({enrollmentRepository:enroll,receiptRepository:receipts});
  const r=await p.recordReceipt({enrollmentId:m.enrollmentId,vaultReceiptId:"vault-receipt-001",envelopeMetadata:input().envelopeMetadata,auditDigest:d("4"),recordedAt:"2026-09-01T04:06:00Z"});
  assert.equal((await p.getReceipt(r.vaultReceiptId,{now:"2026-09-01T04:07:00Z"})).receiptDigest,r.receiptDigest);
  assert.equal((await p.listReceipts({enrollmentId:m.enrollmentId,now:"2026-09-01T04:07:00Z"})).length,1);
});

test("duplicate and orphan persistence operations fail closed",async()=>{
  const m=manifest(),enroll=repo("enrollmentId",[m]),receipts=repo("vaultReceiptId");
  const p=createTemplateVaultReceiptPersistence({enrollmentRepository:enroll,receiptRepository:receipts});
  const args={enrollmentId:m.enrollmentId,vaultReceiptId:"vault-receipt-001",envelopeMetadata:input().envelopeMetadata,auditDigest:d("4"),recordedAt:"2026-09-01T04:06:00Z"};
  await p.recordReceipt(args);await assert.rejects(()=>p.recordReceipt(args),e=>e?.code==="record_conflict");
  enroll.unsafeDelete(m.enrollmentId);await assert.rejects(()=>p.getReceipt("vault-receipt-001"),e=>e?.code==="orphan_template_vault_receipt");
});

test("tampered persisted receipt is rejected on read",async()=>{
  const m=manifest(),enroll=repo("enrollmentId",[m]),receipts=repo("vaultReceiptId");
  const p=createTemplateVaultReceiptPersistence({enrollmentRepository:enroll,receiptRepository:receipts});
  await p.recordReceipt({enrollmentId:m.enrollmentId,vaultReceiptId:"vault-receipt-001",envelopeMetadata:input().envelopeMetadata,auditDigest:d("4"),recordedAt:"2026-09-01T04:06:00Z"});
  receipts.unsafeMutate("vault-receipt-001",r=>{r.auditDigest=d("9");});
  await assert.rejects(()=>p.getReceipt("vault-receipt-001"),e=>e instanceof TrustFaceTemplateVaultReceiptV1Error);
});

test("facade exposes no mutation, deletion, encryption or revocation enforcement path",()=>{
  const p=createTemplateVaultReceiptPersistence({enrollmentRepository:repo("enrollmentId"),receiptRepository:repo("vaultReceiptId")});
  for(const field of ["delete","replace","upsert","storeTemplate","encrypt","deleteTemplate","revoke","enforceRevocation"]) assert.equal(p[field],undefined);
  assert.equal(p.revocationEnforced,false);assert.equal(p.encryptionPerformed,false);assert.equal(p.realVaultReady,false);
});
