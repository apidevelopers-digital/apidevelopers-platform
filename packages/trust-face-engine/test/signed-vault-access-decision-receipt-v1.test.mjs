import assert from "node:assert/strict";
import test from "node:test";
import { createSignedVaultAccessDecisionAudit, assertSignedVaultAccessDecisionReceipt, TRUST_FACE_SIGNED_VAULT_ACCESS_DECISION_RECEIPT_V1 as PROFILE } from "../src/signed-vault-access-decision-receipt-v1.mjs";

const D=(c)=>`sha256:${c.repeat(64)}`;
function repository(){
  const m=new Map();
  return {
    async create(v){ if(m.has(v.decisionId)) throw Error("conflict"); m.set(v.decisionId,structuredClone(v)); return structuredClone(v); },
    async getById(id){ return m.has(id)?structuredClone(m.get(id)):null; },
    async list(){ return [...m.values()].map(structuredClone); },
    _m:m
  };
}
function allowFlow(){
  return {
    async getCryptographicallyVerifiedAuthorizedReceipt(){
      return {authorized:true, trustedKey:{keyId:"lab-key-001",keyFingerprint:D("f")}, productionReady:false};
    }
  };
}
function denyFlow(code="template_vault_receipt_access_revoked"){
  return {async getCryptographicallyVerifiedAuthorizedReceipt(){ const e=new Error("denied"); e.code=code; throw e; }};
}
const input=(o={})=>({
  decisionId:"decision-001",
  vaultReceiptId:"vault-receipt-001",
  authorization:{authorizationDigest:D("a")},
  proof:{keyId:"lab-key-001",algorithm:"Ed25519",signedMessage:"authorizationDigest",authorizationDigest:D("a"),signature:"external-signature"},
  purposeCode:"verification-orchestration",
  now:"2026-09-02T10:00:00Z",
  ...o
});
test("profile remains metadata-only and non-production",()=>{
  assert.equal(PROFILE.accessDecisionRecordedInLab,true);
  for(const f of ["proofPayloadStored","signatureStored","publicKeyStored","privateKeyAccepted","privateKeyStored","rawBiometricPayloadAccepted","rawEmbeddingAccepted","ciphertextStored","kmsMaterialAccepted","externalAuditSinkIntegrated","productionAuditStoreIntegrated","realVaultAccessAuthorized","realVaultReady","productionReady","biometricClaimReady"]) assert.equal(PROFILE[f],false);
});
test("records allowed decision without storing signature or access payload",async()=>{
  const r=repository(), audit=createSignedVaultAccessDecisionAudit({signedFlow:allowFlow(),decisionRepository:r});
  const out=await audit.evaluateAndRecord(input());
  assert.equal(out.allowed,true);
  assert.equal(out.decisionReceipt.decision,"allow");
  assert.equal(out.decisionReceipt.reasonCode,"authorized");
  assert.equal(out.decisionReceipt.signature,undefined);
  assert.equal(out.decisionReceipt.access,undefined);
  assert.equal(out.decisionReceipt.proofDigest.startsWith("sha256:"),true);
  assert.equal(assertSignedVaultAccessDecisionReceipt(out.decisionReceipt).valid,true);
});
test("records denied decision and preserves fail-closed reason code",async()=>{
  const r=repository(), audit=createSignedVaultAccessDecisionAudit({signedFlow:denyFlow("template_vault_access_trust_registry_key_revoked"),decisionRepository:r});
  const out=await audit.evaluateAndRecord(input());
  assert.equal(out.allowed,false);
  assert.equal(out.access,null);
  assert.equal(out.decisionReceipt.decision,"deny");
  assert.equal(out.decisionReceipt.reasonCode,"template_vault_access_trust_registry_key_revoked");
  assert.equal(out.decisionReceipt.trustedKeyFingerprint,null);
});
test("tampered stored receipt fails closed",async()=>{
  const r=repository(), audit=createSignedVaultAccessDecisionAudit({signedFlow:allowFlow(),decisionRepository:r});
  await audit.evaluateAndRecord(input());
  const v=r._m.get("decision-001"); r._m.set("decision-001",{...v,reasonCode:"tampered"});
  await assert.rejects(()=>audit.getDecisionReceipt("decision-001"),e=>e.code==="signed_vault_access_decision_receipt_tampered");
});
test("duplicate decision id is rejected",async()=>{
  const r=repository(), audit=createSignedVaultAccessDecisionAudit({signedFlow:allowFlow(),decisionRepository:r});
  await audit.evaluateAndRecord(input());
  await assert.rejects(()=>audit.evaluateAndRecord(input()),e=>e.code==="signed_vault_access_decision_conflict");
});
test("forbidden raw payload is rejected before flow execution",async()=>{
  let calls=0; const flow={async getCryptographicallyVerifiedAuthorizedReceipt(){calls++;return {trustedKey:{keyFingerprint:D("f")}};}};
  const audit=createSignedVaultAccessDecisionAudit({signedFlow:flow,decisionRepository:repository()});
  await assert.rejects(()=>audit.evaluateAndRecord(input({authorization:{authorizationDigest:D("a"),rawImage:"x"}})),e=>e.code==="signed_vault_access_decision_sensitive_payload_forbidden");
  assert.equal(calls,0);
});
test("receipt exposes no deletion private-key decrypt or ciphertext path",()=>{
  const audit=createSignedVaultAccessDecisionAudit({signedFlow:allowFlow(),decisionRepository:repository()});
  for(const f of ["delete","hardDelete","storePrivateKey","getPrivateKey","decrypt","getCiphertext","getKeyMaterial","getKmsMaterial"]) assert.equal(audit[f],undefined);
  assert.equal(audit.productionReady,false);
});
