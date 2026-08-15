import assert from "node:assert/strict";
import {generateKeyPairSync} from "node:crypto";
import test from "node:test";
import {createTrustEvaluationCredentialEnvelopeHandoff} from "../src/global-trust-evaluation-credential-envelope.mjs";
import {
  TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_ASSERTION as APPROVAL,
  createGlobalTrustEvaluationEnvelopeTransportControl as createControl,
} from "../src/global-trust-evaluation-envelope-transport.mjs";

const NOW="2026-08-14T13:10:00.000Z";
const SECRET="synthetic-evaluation-secret";

async function envelope(){
  const pair=generateKeyPairSync("rsa",{
    modulusLength:2048,
    publicKeyEncoding:{type:"spki",format:"pem"},
    privateKeyEncoding:{type:"pkcs8",format:"pem"},
  });
  let value;
  const handoff=createTrustEvaluationCredentialEnvelopeHandoff({
    recipientPublicKey:pair.publicKey,
    async deliverEnvelope(v){value=structuredClone(v)},
  });
  await handoff.deliver({
    secret:SECRET,
    tenantId:"tenant-transport",
    apiKeyId:"key-transport",
    expiresAt:"2026-08-28T13:10:00.000Z",
    correlationId:"corr-transport",
  });
  assert.ok(value);
  assert.equal(JSON.stringify(value).includes(SECRET),false);
  return value;
}
const sandbox=()=>({
  enabled:true,mode:"sandbox",channelId:"sandbox-memory",channelType:"memory",
});
const external=(approval={})=>({
  enabled:true,mode:"external",channelId:"approved-channel",channelType:"provider-neutral",
  approval:{
    decision:"approved",assertion:APPROVAL,channelId:"approved-channel",
    reference:"institutional-decision:transport:001",
    authority:"API Developers.digital",approvedBy:"approver-1",
    approvedAt:"2026-08-14T13:00:00.000Z",...approval,
  },
});

test("deny-by-default blocks transport",async()=>{
  const value=await envelope();
  const control=createControl({clock:()=>NOW});
  assert.equal(control.policy.enabled,false);
  await assert.rejects(control.deliver({envelope:value}),e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_DISABLED");
});

test("sandbox accepts ciphertext-only envelope through non-egress adapter and returns safe receipt",async()=>{
  const value=await envelope(); let calls=0;
  const control=createControl({
    policy:sandbox(),
    adapter:{kind:"sandbox",externalEgressCapable:false,async deliver(v){
      calls++; assert.deepEqual(v,value);
      return {accepted:true,transportReference:"sandbox:1"};
    }},
    clock:()=>NOW,
  });
  const receipt=await control.deliver({envelope:value});
  assert.equal(calls,1);
  assert.equal(receipt.transported,true);
  assert.equal(receipt.externalDeliveryOccurred,false);
  assert.equal(receipt.ciphertextIncludedInReceipt,false);
  assert.equal(receipt.plaintextCredentialIncluded,false);
  assert.equal(JSON.stringify(receipt).includes(value.ciphertextB64u),false);
  assert.equal(JSON.stringify(receipt).includes(SECRET),false);
});

test("sandbox rejects egress-capable adapters and forbidden fields before delivery",async()=>{
  assert.throws(()=>createControl({
    policy:sandbox(),
    adapter:{kind:"sandbox",externalEgressCapable:true,async deliver(){return {accepted:true,transportReference:"never"}}},
    clock:()=>NOW,
  }),e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_ADAPTER_BOUNDARY");

  const value=await envelope(); let calls=0;
  const control=createControl({
    policy:sandbox(),
    adapter:{kind:"sandbox",externalEgressCapable:false,async deliver(){calls++;return {accepted:true,transportReference:"never"}}},
    clock:()=>NOW,
  });
  await assert.rejects(
    control.deliver({envelope:{...value,secret:SECRET}}),
    e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_FORBIDDEN_FIELD",
  );
  assert.equal(calls,0);
});

test("external mode requires institutional channel approval plus explicit execution approval",async()=>{
  const value=await envelope(); let calls=0;
  const control=createControl({
    policy:external(),
    adapter:{kind:"external",externalEgressCapable:true,async deliver(){
      calls++; return {accepted:true,transportReference:"synthetic-external:1"};
    }},
    clock:()=>NOW,
  });
  await assert.rejects(
    control.deliver({envelope:value}),
    e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_EXTERNAL_APPROVAL_REQUIRED",
  );
  assert.equal(calls,0);
  const receipt=await control.deliver({envelope:value,externalExecutionApproved:true});
  assert.equal(calls,1);
  assert.equal(receipt.externalDeliveryOccurred,true);
  assert.equal(receipt.ciphertextIncludedInReceipt,false);
  assert.equal(receipt.plaintextCredentialIncluded,false);
  assert.equal(JSON.stringify(receipt).includes(value.ciphertextB64u),false);
});

test("external policy rejects future approval and channel mismatch",()=>{
  const adapter={kind:"external",externalEgressCapable:true,async deliver(){return {accepted:true,transportReference:"never"}}};
  assert.throws(()=>createControl({
    policy:external({approvedAt:"2026-08-14T13:11:00.000Z"}),adapter,clock:()=>NOW,
  }),e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_IN_FUTURE");
  assert.throws(()=>createControl({
    policy:external({channelId:"other"}),adapter,clock:()=>NOW,
  }),e=>e.code==="TRUST_EVALUATION_ENVELOPE_TRANSPORT_APPROVAL_CHANNEL_MISMATCH");
});
