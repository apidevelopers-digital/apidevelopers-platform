import assert from "node:assert/strict";
import test from "node:test";
import {
  TRUST_FACE_SIGNED_GOVERNED_TEMPLATE_VAULT_FLOW_V1 as PROFILE,
  createSignedGovernedTemplateVaultFlow,
} from "../src/signed-governed-template-vault-flow-v1.mjs";

const repo=()=>({async create(v){return v;},async getById(){return null;},async list(){return [];}});
const make=()=>createSignedGovernedTemplateVaultFlow({
  enrollmentRepository:repo(), revocationRepository:repo(), receiptRepository:repo(),
  trustedKeyRepository:repo(), trustedKeyRevocationRepository:repo(),
});

test("profile remains lab-only",()=>{
  assert.equal(PROFILE.signedAccessLifecycleComposed,true);
  assert.equal(PROFILE.labTrustRegistryIntegrated,true);
  assert.equal(PROFILE.cryptographicAuthorizationProofVerifiedInLab,true);
  for(const f of ["signingPerformed","privateKeyAccepted","privateKeyStored","externalAuthorizationIssuerIntegrated",
    "externalRevocationAuthorityIntegrated","productionTrustRegistryIntegrated","productionKeyManagementIntegrated",
    "productionCryptographicAuthorizationProofVerified","realVaultAccessAuthorized","realVaultReady","productionReady","biometricClaimReady"])
    assert.equal(PROFILE[f],false);
});

test("composes governed methods without signing surface",async()=>{
  const flow=make();
  assert.equal((await flow.enroll({id:"e"})).kind,"enroll");
  assert.equal((await flow.recordVaultReceipt({id:"r"})).kind,"receipt");
  for(const f of ["signAuthorization","createSignedProof","storePrivateKey","setPrivateKey","getPrivateKey","deleteKey","decrypt","getCiphertext"])
    assert.equal(flow[f],undefined);
});

test("registry-backed verified access accepts external proof",async()=>{
  const flow=make();
  await flow.registerLabTrustedPublicKey({keyId:"lab-key-1",publicKeyPem:"PUBLIC"});
  const result=await flow.getCryptographicallyVerifiedAuthorizedReceipt({
    vaultReceiptId:"vault-1",
    authorization:{authorizationDigest:"sha256:"+"a".repeat(64)},
    proof:{keyId:"lab-key-1",signature:"external"},
    purposeCode:"verification-orchestration",
    now:"2026-09-01T20:10:00Z",
  });
  assert.equal(result.authorized,true);
  assert.equal(result.cryptographicProof.verified,true);
  assert.equal(result.productionReady,false);
});

test("trusted key revocation blocks signed access",async()=>{
  const flow=make();
  await flow.registerLabTrustedPublicKey({keyId:"lab-key-1",publicKeyPem:"PUBLIC"});
  await flow.revokeLabTrustedPublicKey({keyId:"lab-key-1"});
  await assert.rejects(()=>flow.getCryptographicallyVerifiedAuthorizedReceipt({
    vaultReceiptId:"vault-1",authorization:{authorizationDigest:"sha256:"+"a".repeat(64)},
    proof:{keyId:"lab-key-1",signature:"external"},purposeCode:"verification-orchestration",now:"2026-09-01T20:10:00Z",
  }), e=>e?.code==="template_vault_access_trust_registry_key_revoked");
});

test("enrollment revocation remains effective in signed path",async()=>{
  const flow=make();
  await flow.registerLabTrustedPublicKey({keyId:"lab-key-1",publicKeyPem:"PUBLIC"});
  await flow.revokeEnrollment({enrollmentId:"e"});
  await assert.rejects(()=>flow.getCryptographicallyVerifiedAuthorizedReceipt({
    vaultReceiptId:"vault-1",authorization:{authorizationDigest:"sha256:"+"a".repeat(64)},
    proof:{keyId:"lab-key-1",signature:"external"},purposeCode:"verification-orchestration",now:"2026-09-01T20:10:00Z",
  }), e=>e?.code==="template_vault_receipt_access_revoked");
});

test("key lifecycle snapshot remains lab metadata",async()=>{
  const flow=make();
  await flow.registerLabTrustedPublicKey({keyId:"lab-key-1",publicKeyPem:"PUBLIC"});
  const snap=await flow.getTrustedKeyLifecycleSnapshot("lab-key-1",{now:"2026-09-01T20:10:00Z"});
  assert.equal(snap.state,"active");
  assert.equal(snap.productionReady,false);
});
