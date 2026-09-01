import assert from "node:assert/strict";
import test from "node:test";
import { generateKeyPairSync, sign } from "node:crypto";
import { TRUST_FACE_TEMPLATE_VAULT_ACCESS_TRUST_REGISTRY_V1 as PROFILE, TrustFaceTemplateVaultAccessTrustRegistryV1Error,
  createTemplateVaultAccessTrustRegistry, createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess } from "../src/template-vault-access-trust-registry-v1.mjs";
const D=(c)=>`sha256:${c.repeat(64)}`;
function repository(){ const m=new Map(); return {async create(v){if(m.has(v.keyId))throw Error("conflict");m.set(v.keyId,structuredClone(v));return structuredClone(v);},
  async getById(id){return m.has(id)?structuredClone(m.get(id)):null;},async list(){return[...m.values()].map(structuredClone);},_m:m};}
function setup(){const keyRepository=repository(),revocationRepository=repository();return{registry:createTemplateVaultAccessTrustRegistry({keyRepository,revocationRepository}),keyRepository,revocationRepository};}
const kp=()=>generateKeyPairSync("ed25519");
const input=(pub,o={})=>({keyId:"lab-key-001",publicKeyPem:pub.export({type:"spki",format:"pem"}).toString(),
  validFrom:"2026-09-01T20:00:00Z",validUntil:"2026-09-01T21:00:00Z",registeredAt:"2026-09-01T20:01:00Z",registrationEvidenceDigest:D("1"),...o});

test("profile stays lab-only",()=>{assert.equal(PROFILE.labTrustRegistryIntegrated,true);for(const f of["privateKeyAccepted","privateKeyStored","productionTrustRegistryIntegrated",
  "productionKeyManagementIntegrated","externalAuthorizationIssuerIntegrated","externalRevocationAuthorityIntegrated","productionCryptographicAuthorizationProofVerified",
  "realVaultAccessAuthorized","realVaultReady","productionReady","biometricClaimReady"])assert.equal(PROFILE[f],false);});

test("register, resolve, validity and duplicate checks",async()=>{const{publicKey}=kp(),{registry}=setup();const r=await registry.registerTrustedPublicKey(input(publicKey));
  assert.match(r.keyFingerprint,/^sha256:[0-9a-f]{64}$/);assert.equal((await registry.resolveTrustedPublicKey(r.keyId,{now:"2026-09-01T20:10:00Z"})).keyFingerprint,r.keyFingerprint);
  await assert.rejects(()=>registry.registerTrustedPublicKey(input(publicKey)),e=>e.code==="template_vault_access_trust_registry_key_conflict");
  for(const now of["2026-09-01T19:59:59Z","2026-09-01T21:00:00Z"])await assert.rejects(()=>registry.resolveTrustedPublicKey(r.keyId,{now}),e=>e.code==="template_vault_access_trust_registry_key_not_active");});

test("private and non-Ed25519 keys are rejected",async()=>{const{privateKey}=kp(),{registry}=setup();
  await assert.rejects(()=>registry.registerTrustedPublicKey({keyId:"private",publicKeyPem:privateKey.export({type:"pkcs8",format:"pem"}).toString(),
    validFrom:"2026-09-01T20:00:00Z",validUntil:"2026-09-01T21:00:00Z",registeredAt:"2026-09-01T20:01:00Z",registrationEvidenceDigest:D("1")}),
    e=>e instanceof TrustFaceTemplateVaultAccessTrustRegistryV1Error&&e.code==="template_vault_access_trust_registry_private_key_forbidden");
  const rsa=generateKeyPairSync("rsa",{modulusLength:2048});await assert.rejects(()=>registry.registerTrustedPublicKey(input(rsa.publicKey)),e=>e.code==="invalid_template_vault_access_trust_registry_algorithm");});

test("revocation is append-only and blocks current resolution",async()=>{const{publicKey}=kp(),{registry}=setup();const k=await registry.registerTrustedPublicKey(input(publicKey));
  const rv=await registry.revokeTrustedPublicKey({keyId:k.keyId,reasonCode:"key-rotation",revokedAt:"2026-09-01T20:30:00Z",revocationEvidenceDigest:D("2")});
  assert.equal(rv.physicalKeyDeletionPerformed,false);assert.equal((await registry.getKeyLifecycleSnapshot(k.keyId,{now:"2026-09-01T20:20:00Z"})).state,"active");
  assert.equal((await registry.getKeyLifecycleSnapshot(k.keyId,{now:"2026-09-01T20:40:00Z"})).state,"revoked");
  await registry.resolveTrustedPublicKey(k.keyId,{now:"2026-09-01T20:20:00Z"});
  await assert.rejects(()=>registry.resolveTrustedPublicKey(k.keyId,{now:"2026-09-01T20:40:00Z"}),e=>e.code==="template_vault_access_trust_registry_key_revoked");});

test("tampered key and revocation records fail closed",async()=>{const{publicKey}=kp(),a=setup();await a.registry.registerTrustedPublicKey(input(publicKey));
  const k=a.keyRepository._m.get("lab-key-001");a.keyRepository._m.set("lab-key-001",{...k,keyFingerprint:D("f")});
  await assert.rejects(()=>a.registry.resolveTrustedPublicKey("lab-key-001",{now:"2026-09-01T20:10:00Z"}),e=>e.code==="template_vault_access_trust_registry_record_tampered");
  const b=setup();await b.registry.registerTrustedPublicKey(input(publicKey));await b.registry.revokeTrustedPublicKey({keyId:"lab-key-001",reasonCode:"key-compromise",revokedAt:"2026-09-01T20:30:00Z",revocationEvidenceDigest:D("2")});
  const rv=b.revocationRepository._m.get("lab-key-001");b.revocationRepository._m.set("lab-key-001",{...rv,revocationDigest:D("e")});
  await assert.rejects(()=>b.registry.getKeyLifecycleSnapshot("lab-key-001",{now:"2026-09-01T20:40:00Z"}),e=>e.code==="template_vault_access_trust_registry_revocation_tampered");});

test("registry-backed proof accepts active trusted key",async()=>{const{publicKey,privateKey}=kp(),{registry}=setup();await registry.registerTrustedPublicKey(input(publicKey));const authorizationDigest=D("a");
  const proof={keyId:"lab-key-001",algorithm:"Ed25519",signedMessage:"authorizationDigest",authorizationDigest,signature:sign(null,Buffer.from(authorizationDigest),privateKey).toString("base64")};
  let calls=0;const facade=createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess({trustRegistry:registry,authorizedReceiptAccess:{async getAuthorizedReceipt({vaultReceiptId}){calls++;return{authorized:true,vaultReceipt:{vaultReceiptId},productionReady:false};}}});
  const r=await facade.getRegistryBackedCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId:"vault-001",authorization:{authorizationDigest},proof,purposeCode:"verification-orchestration",now:"2026-09-01T20:10:00Z"});
  assert.equal(calls,1);assert.equal(r.cryptographicProof.verified,true);assert.equal(r.trustedKey.keyId,"lab-key-001");assert.equal(r.productionReady,false);});

test("registry-backed proof rejects revoked key before receipt access",async()=>{const{publicKey,privateKey}=kp(),{registry}=setup();await registry.registerTrustedPublicKey(input(publicKey));
  await registry.revokeTrustedPublicKey({keyId:"lab-key-001",reasonCode:"key-compromise",revokedAt:"2026-09-01T20:05:00Z",revocationEvidenceDigest:D("2")});let calls=0;
  const facade=createTrustRegistryBackedCryptographicallyVerifiedTemplateVaultReceiptAccess({trustRegistry:registry,authorizedReceiptAccess:{async getAuthorizedReceipt(){calls++;return{authorized:true};}}});
  const authorizationDigest=D("a"),proof={keyId:"lab-key-001",algorithm:"Ed25519",signedMessage:"authorizationDigest",authorizationDigest,signature:sign(null,Buffer.from(authorizationDigest),privateKey).toString("base64")};
  await assert.rejects(()=>facade.getRegistryBackedCryptographicallyVerifiedAuthorizedReceipt({vaultReceiptId:"v",authorization:{authorizationDigest},proof,purposeCode:"verification-orchestration",now:"2026-09-01T20:10:00Z"}),e=>e.code==="template_vault_access_trust_registry_key_revoked");assert.equal(calls,0);});

test("no deletion/private-key paths",()=>{const{registry}=setup();for(const f of["delete","hardDelete","deleteTrustedPublicKey","storePrivateKey","setPrivateKey","getPrivateKey","decrypt","getCiphertext","getKeyMaterial"])assert.equal(registry[f],undefined);
  assert.equal(registry.privateKeyAccepted,false);assert.equal(registry.privateKeyStored,false);assert.equal(registry.productionReady,false);});
