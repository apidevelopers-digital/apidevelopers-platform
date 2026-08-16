import assert from "node:assert/strict";
import test from "node:test";
import {createWebAgentShadowConversationService,WebAgentShadowClientError} from "../src/web-agent-shadow-client.mjs";

function envelope(memoryContext){
  return {
    conversation:{
      agent:{id:"uni.co",runtime:"uni-co-runtime"},
      tenantId:"tenant:server",
      workspaceId:"workspace:uni",
      conversationId:"conv:001",
      requestId:"req:001",
      correlationId:"corr:001",
      locale:"pt-BR",
      input:{parts:[{type:"text",text:"Olá"}]},
    },
    internationalContext:{locale:"pt-BR",timeZone:"America/Sao_Paulo",currency:"BRL",legalRegion:"BR"},
    ...(memoryContext===undefined?{}:{memoryContext}),
  };
}
function safeResponse(){
  return {ok:true,status:200,async json(){return {ok:true,result:{
    agentId:"uni.co",runtime:"uni-co-runtime",executed:false,sendAllowed:false,
    parts:[{type:"text",text:"ok"}],memoryRead:true,memoryWriteProposed:false,
    toolProposals:[],externalExecutionProposed:false
  }}}};
}
function memory(data={summary:"Resumo",nextBestAction:"Continuar",openLoops:["oferta"],topics:["saas"]}){
  return {schema:"apidevelopers.web-agent-memory-context.v1",mode:"read_only",agentId:"uni.co",tenantId:"tenant:server",workspaceId:"workspace:uni",data};
}
test("transports minimized read-only memory context",async()=>{
  let sent;
  const service=createWebAgentShadowConversationService({
    baseUrl:"http://127.0.0.1:9999",apiKey:"fixture-key",allowInsecureHttp:true,
    fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return safeResponse()}
  });
  const result=await service.handle(envelope(memory()));
  assert.deepEqual(sent.context.memoryContext,{
    schema:"apidevelopers.web-agent-memory-context.v1",
    mode:"read_only",
    data:{summary:"Resumo",nextBestAction:"Continuar",openLoops:["oferta"],topics:["saas"]}
  });
  assert.equal("agentId" in sent.context.memoryContext,false);
  assert.equal("tenantId" in sent.context.memoryContext,false);
  assert.equal("workspaceId" in sent.context.memoryContext,false);
  assert.equal(result.memoryWriteProposed,false);
  assert.deepEqual(result.toolProposals,[]);
});
test("preserves existing wire when memory is absent",async()=>{
  let sent;
  const service=createWebAgentShadowConversationService({
    baseUrl:"http://127.0.0.1:9999",apiKey:"fixture-key",allowInsecureHttp:true,
    fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return safeResponse()}
  });
  await service.handle(envelope());
  assert.equal("memoryContext" in sent.context,false);
});
test("fails closed on memory identity mismatch",async()=>{
  const service=createWebAgentShadowConversationService({
    baseUrl:"http://127.0.0.1:9999",apiKey:"fixture-key",allowInsecureHttp:true,
    fetchImpl:async()=>safeResponse()
  });
  await assert.rejects(
    ()=>service.handle(envelope({...memory(),workspaceId:"workspace:nexus"})),
    e=>e instanceof WebAgentShadowClientError&&e.code==="web_agent_shadow_memory_identity_mismatch"
  );
});
test("fails closed on non-read-only or non-minimized memory",async()=>{
  const service=createWebAgentShadowConversationService({
    baseUrl:"http://127.0.0.1:9999",apiKey:"fixture-key",allowInsecureHttp:true,
    fetchImpl:async()=>safeResponse()
  });
  await assert.rejects(
    ()=>service.handle(envelope({...memory(),mode:"write"})),
    e=>e instanceof WebAgentShadowClientError&&e.code==="web_agent_shadow_memory_not_read_only"
  );
  await assert.rejects(
    ()=>service.handle(envelope(memory({summary:"ok",secret:"no"}))),
    e=>e instanceof WebAgentShadowClientError&&e.code==="web_agent_shadow_memory_not_minimized"
  );
});
