import assert from "node:assert/strict";
import {constants,generateKeyPairSync,sign} from "node:crypto";
import {mkdtemp,readFile,rm} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {createJsonFileStore} from "@apidevelopers/persistence-core";
import {createTrustEvaluationRecipientKeyProofService} from "../src/global-trust-evaluation-recipient-key-proof.mjs";

function pair(bits=2048){return generateKeyPairSync("rsa",{modulusLength:bits,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}})}
function signature(challenge,privateKey){
 const bytes=Buffer.from(challenge.signingPayloadB64u,"base64url");
 return sign("sha256",bytes,{key:privateKey,padding:constants.RSA_PKCS1_PSS_PADDING,saltLength:32}).toString("base64url");
}
async function fixture(){
 const dir=await mkdtemp(path.join(os.tmpdir(),"trust-key-proof-")),filePath=path.join(dir,"state.json");
 let now="2026-08-14T10:00:00.000Z";
 const store=createJsonFileStore({filePath,clock:()=>now,idFactory:()=>"write"});
 const service=createTrustEvaluationRecipientKeyProofService({store,clock:()=>now});
 return {dir,filePath,store,service,setNow:v=>{now=v}};
}
const request=(publicKey,extra={})=>({organizationId:"component.organization.acme",recipientPublicKey:publicKey,correlationId:"corr-key-proof-001",...extra});

test("proof of possession survives store reopen and never persists signature or private key",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const keys=pair(),challenge=await f.service.issueChallenge(request(keys.publicKey));
 const sig=signature(challenge,keys.privateKey);
 const reopened=createJsonFileStore({filePath:f.filePath,clock:()=> "2026-08-14T10:00:30.000Z",idFactory:()=>"write2"});
 const service=createTrustEvaluationRecipientKeyProofService({store:reopened,clock:()=> "2026-08-14T10:00:30.000Z"});
 const proof=await service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:sig});
 assert.equal(proof.keyPossessionVerified,true);
 assert.equal(proof.identityVerified,false);
 assert.equal(proof.organizationId,"component.organization.acme");
 const snapshot=await readFile(f.filePath,"utf8");
 assert.equal(snapshot.includes(keys.privateKey),false);
 assert.equal(snapshot.includes(sig),false);
 assert.match(snapshot,/"keyPossessionVerified"\s*:\s*true/);
 assert.match(snapshot,/"identityVerified"\s*:\s*false/);
});

test("consumed challenge rejects replay",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const keys=pair(),challenge=await f.service.issueChallenge(request(keys.publicKey));
 const sig=signature(challenge,keys.privateKey);
 await f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:sig});
 await assert.rejects(
  f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:sig}),
  e=>e.code==="TRUST_EVALUATION_KEY_PROOF_REPLAY"
 );
});

test("wrong recipient and invalid signature fail closed without consuming valid proof",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const keys=pair(),other=pair(),challenge=await f.service.issueChallenge(request(keys.publicKey));
 await assert.rejects(
  f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:other.publicKey,signatureB64u:signature(challenge,other.privateKey)}),
  e=>e.code==="TRUST_EVALUATION_KEY_PROOF_RECIPIENT_MISMATCH"
 );
 const bad=Buffer.alloc(256,9).toString("base64url");
 await assert.rejects(
  f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:bad}),
  e=>e.code==="TRUST_EVALUATION_KEY_PROOF_INVALID_SIGNATURE"
 );
 const proof=await f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:signature(challenge,keys.privateKey)});
 assert.equal(proof.keyPossessionVerified,true);
});

test("expired challenge fails closed",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const keys=pair(),challenge=await f.service.issueChallenge(request(keys.publicKey,{ttlMs:60000}));
 f.setNow("2026-08-14T10:01:00.000Z");
 await assert.rejects(
  f.service.verifyAndConsume({challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:signature(challenge,keys.privateKey)}),
  e=>e.code==="TRUST_EVALUATION_KEY_PROOF_EXPIRED"
 );
});

test("concurrent verification consumes challenge exactly once",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const keys=pair(),challenge=await f.service.issueChallenge(request(keys.publicKey));
 const args={challengeId:challenge.challengeId,recipientPublicKey:keys.publicKey,signatureB64u:signature(challenge,keys.privateKey)};
 const results=await Promise.allSettled([f.service.verifyAndConsume(args),f.service.verifyAndConsume(args)]);
 assert.equal(results.filter(r=>r.status==="fulfilled").length,1);
 const rejection=results.find(r=>r.status==="rejected");
 assert.equal(rejection.reason.code,"TRUST_EVALUATION_KEY_PROOF_REPLAY");
});

test("public-key and TTL boundary reject unsafe inputs",async t=>{
 const f=await fixture();t.after(()=>rm(f.dir,{recursive:true,force:true}));
 const strong=pair(),weak=pair(1024);
 await assert.rejects(f.service.issueChallenge(request(strong.privateKey)),e=>e.code==="TRUST_EVALUATION_KEY_PROOF_PRIVATE_KEY_REJECTED");
 await assert.rejects(f.service.issueChallenge(request(weak.publicKey)),e=>e.code==="TRUST_EVALUATION_KEY_PROOF_WEAK_PUBLIC_KEY");
 await assert.rejects(f.service.issueChallenge(request(strong.publicKey,{ttlMs:60000.5})),e=>e.code==="TRUST_EVALUATION_KEY_PROOF_INVALID_TTL");
});
