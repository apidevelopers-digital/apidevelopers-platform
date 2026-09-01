import assert from "node:assert/strict";
import test from "node:test";
import { createEnrollmentManifest } from "../src/enrollment-manifest-v1.mjs";
import { createEnrollmentRevocationPersistence } from "../src/enrollment-revocation-v1.mjs";

const d=(c)=>`sha256:${c.repeat(64)}`;
function manifest(){
  return createEnrollmentManifest({
    enrollmentId:"enrollment-list-001",
    subjectRef:"subject-list-001",
    templateRef:"vault://trust-face/templates/list-001",
    templateDigest:d("1"),
    modelVersion:"trust-face-owned-embedding/v1",
    consentLedgerDigest:d("2"),
    authorizationDigest:d("3"),
    enrolledAt:"2026-08-31T23:00:00Z",
  });
}
function repo(initial=[]){
  const m=new Map(initial.map((r)=>[r.enrollmentId,structuredClone(r)]));
  return {
    async create(r){ if(m.has(r.enrollmentId)){const e=new Error("record conflict");e.code="record_conflict";throw e;} m.set(r.enrollmentId,structuredClone(r)); return structuredClone(r); },
    async getById(id){ return m.has(id)?structuredClone(m.get(id)):null; },
    async list(){ return [...m.values()].map((record)=>structuredClone(record)); },
  };
}
test("listRevocations returns only verified revocation records", async()=>{
  const enrollment=manifest();
  const enrollmentRepository=repo([enrollment]);
  const revocationRepository=repo();
  const lifecycle=createEnrollmentRevocationPersistence({enrollmentRepository,revocationRepository});
  await lifecycle.revokeEnrollment({
    enrollmentId:enrollment.enrollmentId,
    revocationAuthorizationDigest:d("b"),
    reasonCode:"subject-request",
    revokedAt:"2026-08-31T23:10:00Z",
  });
  const records=await lifecycle.listRevocations({now:"2026-08-31T23:20:00Z"});
  assert.equal(records.length,1);
  assert.equal(records[0].enrollmentId,enrollment.enrollmentId);
  assert.equal(records[0].nextState,"revoked");
});
