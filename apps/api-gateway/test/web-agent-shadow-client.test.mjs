import assert from "node:assert/strict";
import test from "node:test";

import {
  WebAgentShadowClientError,
  createWebAgentShadowConversationService,
  webAgentShadowEndpointPath,
} from "../src/web-agent-shadow-client.mjs";

const KEY="fixture-key";

function envelope({agentId="uni.co",runtime="uni-co-runtime",parts=[{type:"text",text:"Hola"}]}={}){
  return {
    conversation:{
      agent:{id:agentId,runtime},
      tenantId:"tenant:001",
      workspaceId:"workspace:001",
      principalId:"user:001",
      sessionId:"session:001",
      conversationId:"conv:001",
      requestId:"request:001",
      correlationId:"correlation:001",
      locale:"es",
      input:{parts},
    },
    internationalContext:{
      locale:"es",
      timeZone:"America/Mexico_City",
      currency:"MXN",
      legalRegion:"MX",
    },
    accessContext:{productId:"must-not-forward"},
  };
}
function response(result,status=200){
  return {ok:status>=200&&status<300,status,async json(){return {ok:true,result};}};
}
function result({agentId="uni.co",runtime="uni-co-runtime",...rest}={}){
  return {
    agentId,runtime,executed:false,sendAllowed:false,
    parts:[{type:"text",text:"Respuesta"}],
    memoryRead:false,memoryWriteProposed:false,toolProposals:[],
    externalExecutionProposed:false,...rest
  };
}

test("sends only governed server-side fields and technical auth to the shadow bridge",async()=>{
  const calls=[];
  const service=createWebAgentShadowConversationService({
    baseUrl:"https://runtime.example/",
    apiKey:KEY,
    fetchImpl:async(url,options)=>{calls.push({url,options});return response(result());},
  });
  const out=await service.handle(envelope());
  assert.equal(calls.length,1);
  assert.equal(calls[0].url,`https://runtime.example${webAgentShadowEndpointPath}`);
  assert.equal(calls[0].options.headers["x-unico-api-key"],KEY);
  assert.equal(calls[0].options.headers["x-tenant-id"],"tenant:001");
  assert.equal(calls[0].options.headers["x-request-id"],"request:001");
  assert.equal(calls[0].options.headers["x-correlation-id"],"correlation:001");

  const body=JSON.parse(calls[0].options.body);
  assert.deepEqual(body,{
    agentId:"uni.co",tenantId:"tenant:001",conversationId:"conv:001",
    locale:"es",workspaceId:"workspace:001",
    parts:[{type:"text",text:"Hola"}],
    context:{workspaceId:"workspace:001",legalRegion:"MX",currency:"MXN",timezone:"America/Mexico_City"},
  });
  assert.equal("principalId" in body,false);
  assert.equal("sessionId" in body,false);
  assert.equal("productId" in body,false);
  assert.deepEqual(out,{
    parts:[{type:"text",text:"Respuesta"}],memoryRead:false,
    memoryWriteProposed:false,toolProposals:[],externalExecutionProposed:false,
  });
});

test("preserves NEXUS identity and runtime",async()=>{
  const service=createWebAgentShadowConversationService({
    baseUrl:"https://runtime.example/",
    apiKey:KEY,
    fetchImpl:async(_url,options)=>{
      const body=JSON.parse(options.body);
      assert.equal(body.agentId,"nexus");
      return response(result({agentId:"nexus",runtime:"nexus-runtime"}));
    },
  });
  const out=await service.handle(envelope({agentId:"nexus",runtime:"nexus-runtime"}));
  assert.equal(out.parts[0].text,"Respuesta");
});

test("fails before network for non-text media in the first shadow slice",async()=>{
  let calls=0;
  const service=createWebAgentShadowConversationService({
    baseUrl:"https://runtime.example/",apiKey:KEY,
    fetchImpl:async()=>{calls++;throw new Error("must not run");},
  });
  await assert.rejects(
    service.handle(envelope({parts:[{type:"image",assetId:"asset:001",mimeType:"image/png"}]})),
    error=>error instanceof WebAgentShadowClientError&&error.code==="web_agent_shadow_text_only"&&error.status===422,
  );
  assert.equal(calls,0);
});

test("rejects upstream identity or execution escalation",async()=>{
  for(const unsafe of [
    result({agentId:"nexus",runtime:"nexus-runtime"}),
    result({executed:true}),
    result({sendAllowed:true}),
    result({toolProposals:[{name:"unsafe"}]}),
    result({memoryWriteProposed:true}),
    result({externalExecutionProposed:true}),
  ]){
    const service=createWebAgentShadowConversationService({
      baseUrl:"https://runtime.example/",apiKey:KEY,
      fetchImpl:async()=>response(unsafe),
    });
    await assert.rejects(service.handle(envelope()),WebAgentShadowClientError);
  }
});

test("sanitizes upstream failures and never includes technical credentials in the error",async()=>{
  const service=createWebAgentShadowConversationService({
    baseUrl:"https://runtime.example/",apiKey:KEY,
    fetchImpl:async()=>({ok:false,status:401,async json(){return {error:"private upstream detail"};}}),
  });
  await assert.rejects(service.handle(envelope()),error=>{
    assert.equal(error.code,"web_agent_shadow_upstream_rejected");
    assert.equal(error.status,401);
    assert.equal(error.message.includes(KEY),false);
    assert.equal(error.message.includes("private upstream detail"),false);
    return true;
  });
});

test("times out fail-closed without leaking connection details",async()=>{
  const service=createWebAgentShadowConversationService({
    baseUrl:"https://runtime.example/",apiKey:KEY,timeoutMs:5,
    fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>{
      signal.addEventListener("abort",()=>{const error=new Error("aborted");error.name="AbortError";reject(error);},{once:true});
    }),
  });
  await assert.rejects(service.handle(envelope()),error=>
    error instanceof WebAgentShadowClientError&&error.code==="web_agent_shadow_timeout"&&error.status===504
  );
});

test("requires HTTPS unless explicitly enabled for local tests",()=>{
  assert.throws(()=>createWebAgentShadowConversationService({
    baseUrl:"http://runtime.example/",apiKey:KEY,fetchImpl:async()=>response(result()),
  }),/https/);
  assert.doesNotThrow(()=>createWebAgentShadowConversationService({
    baseUrl:"http://127.0.0.1:3000/",apiKey:KEY,allowInsecureHttp:true,
    fetchImpl:async()=>response(result()),
  }));
});
