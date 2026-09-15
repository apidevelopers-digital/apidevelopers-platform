import test from "node:test";
import assert from "node:assert/strict";

import {
  createZuniChannelBindingWriteComposition,
  zuniChannelBindingWritePath,
  ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION,
} from "../src/zuni-channel-binding-write-composition.mjs";

const AUTH="Bearer zuni-binding-writer-0123456789abcdef";
const TENANT="component.tenant.acme";
const WORKSPACE="component.workspace.acme.principal";
const REF=`cred_${"a".repeat(64)}`;
const WABA="waba-123";
const PHONE="phone-123";
const NOW="2026-09-15T08:55:00.000Z";

const app=()=>Object.freeze({async handleRequest(request={}){return {status:299,headers:{},body:JSON.stringify({delegated:true,url:request.url??"/"})}}});
const store=()=>Object.freeze({async read(){return {}},async transaction(work){return typeof work==="function"?work({}):undefined}});

function build({runtimeResult,runtimeError,enabled=true,authorization=AUTH}={}){
  const calls=[];
  const composition=createZuniChannelBindingWriteComposition({
    app:app(),store:store(),consumerAuthorization:authorization,enabled,
    compareSecrets:(a,b)=>a===b,clock:()=>NOW,
    saasRuntimeFactory:({store})=>Object.freeze({store}),
    channelRuntimeFactory:()=>Object.freeze({
      async registerChannelBinding(input){
        calls.push(input);
        if(runtimeError)throw runtimeError;
        return runtimeResult??{
          ...input,
          bindingId:"component.channel-binding.acme.principal.phone-123",
          accessToken:"must-never-return",
          credentialValue:"must-never-return",
        };
      },
    }),
  });
  return {composition,calls};
}

async function request(composition,{headers={},body={},method="POST",url=zuniChannelBindingWritePath}={}){
  const result=await composition.app.handleRequest({method,url,headers,body:JSON.stringify(body)});
  return {...result,json:JSON.parse(result.body)};
}

const payload=()=>({tenantId:TENANT,workspaceId:WORKSPACE,credentialRef:REF,wabaId:WABA,phoneNumberId:PHONE});
const headers=()=>({authorization:AUTH,"x-zuni-write-authorization":ZUNI_CHANNEL_BINDING_WRITE_AUTHORIZATION});

test("write composition is disabled by default",()=>{
  const composition=createZuniChannelBindingWriteComposition({app:app()});
  assert.equal(composition.enabled,false);
  assert.equal(composition.descriptor.writeEnabled,false);
  assert.equal(composition.descriptor.productionChanged,false);
  assert.equal(composition.descriptor.runtimeAutoWiring,false);
});

test("server authorization and explicit write authorization are both required",async()=>{
  const {composition,calls}=build();
  const unauth=await request(composition,{body:payload()});
  assert.equal(unauth.status,401);
  assert.equal(unauth.json.bindingWriteExecuted,false);
  const noWrite=await request(composition,{headers:{authorization:AUTH},body:payload()});
  assert.equal(noWrite.status,403);
  assert.equal(noWrite.json.error,"zuni_channel_binding_write_authorization_required");
  assert.equal(calls.length,0);
});

test("payload rejects secret material and caller-selected channel metadata",async()=>{
  for(const injected of [
    {accessToken:"secret"},
    {token:"secret"},
    {appSecret:"secret"},
    {provider:"wAti"},
    {channelId:"other"},
    {status:"disabled"},
    {bindingId:"component.channel-binding.other"},
  ]){
    const {composition,calls}=build();
    const result=await request(composition,{headers:headers(),body:{...payload(),...injected}});
    assert.equal(result.status,400);
    assert.equal(result.json.error,"zuni_channel_binding_write_payload_invalid");
    assert.equal(calls.length,0);
  }
});

test("authorized request derives the commercial binding contract and sanitizes the response",async()=>{
  const {composition,calls}=build();
  const result=await request(composition,{headers:headers(),body:payload()});
  assert.equal(result.status,200);
  assert.equal(result.json.ok,true);
  assert.equal(result.json.channelId,PHONE);
  assert.equal(result.json.bindingWriteExecuted,true);
  assert.equal(result.json.secretsReturned,false);
  assert.equal(calls.length,1);
  assert.deepEqual(calls[0],{
    tenantId:TENANT,workspaceId:WORKSPACE,productId:"zuni",provider:"meta",
    channelType:"whatsapp_business",channelId:PHONE,wabaId:WABA,phoneNumberId:PHONE,
    credentialRef:REF,status:"active",createdAt:NOW,updatedAt:NOW,
  });
  assert.equal("credentialRef" in result.json.binding,false);
  assert.equal(JSON.stringify(result.json).includes("must-never-return"),false);
  assert.equal(result.headers["cache-control"],"no-store");
});

test("runtime rejection fails closed without reporting a write",async()=>{
  const {composition}=build({runtimeError:new Error("scope mismatch")});
  const result=await request(composition,{headers:headers(),body:payload()});
  assert.equal(result.status,409);
  assert.equal(result.json.error,"zuni_channel_binding_write_rejected");
  assert.equal(result.json.bindingWriteExecuted,false);
  assert.equal(result.json.secretsReturned,false);
});

test("non-target requests are delegated to the existing gateway",async()=>{
  const {composition,calls}=build();
  const result=await request(composition,{method:"GET",url:"/health"});
  assert.equal(result.status,299);
  assert.deepEqual(result.json,{delegated:true,url:"/health"});
  assert.equal(calls.length,0);
});

test("consumer authorization must be high entropy",()=>{
  assert.throws(()=>build({authorization:"short"}),/at least 32 characters/);
});
