import assert from "node:assert/strict";
import test from "node:test";

import {
  browserSessionCookieName,
  hashBrowserSessionSecret,
} from "@apidevelopers/auth-core/browser-session-authenticator";
import { createWebAgentShadowBrowserComposition } from "../src/web-agent-shadow-browser-composition.mjs";

const SESSION="a".repeat(43);
const TECHNICAL_KEY="fixture-key";

test("browser session reaches uni.co shadow only after entitlement and international context",async()=>{
  const seen={access:[],upstream:[]};
  const composition=createWebAgentShadowBrowserComposition({
    async resolveSessionByHash(hash){
      assert.equal(hash,hashBrowserSessionSecret(SESSION));
      return {
        status:"active",expiresAt:"2026-08-16T00:00:00.000Z",
        principal:{id:"user:001",tenantId:"tenant:001",status:"active",scopes:["web:chat"]},
      };
    },
    saasAccess:{
      async evaluateAccess(context){seen.access.push(context);return {allowed:true};},
    },
    tenantInternationalProfile:{
      async resolve(){
        return {
          defaultLocale:"es-MX",fallbackLocale:"pt-BR",
          timeZone:"America/Mexico_City",legalRegion:"MX",
        };
      },
    },
    commercialContext:{
      async resolve(){return {currency:"MXN"};},
    },
    now:()=>new Date("2026-08-15T10:00:00.000Z"),
    shadowRuntime:{
      baseUrl:"https://runtime.example/",
      apiKey:TECHNICAL_KEY,
      fetchImpl:async(url,options)=>{
        seen.upstream.push({url,options});
        return {
          ok:true,status:200,
          async json(){
            return {
              ok:true,
              result:{
                agentId:"uni.co",runtime:"uni-co-runtime",
                executed:false,sendAllowed:false,
                parts:[{type:"text",text:"Hola desde uni.co"}],
                memoryRead:false,memoryWriteProposed:false,
                toolProposals:[],externalExecutionProposed:false,
              },
            };
          },
        };
      },
    },
  });

  const result=await composition.route.handle({
    method:"POST",
    url:"/v1/web-agent/conversations",
    headers:{cookie:`${browserSessionCookieName}=${SESSION}`},
    body:{
      accessGrantId:"grant:001",
      workspaceId:"workspace:001",
      productId:"product:uni-co",
      agentId:"uni.co",
      conversationId:"conv:001",
      sessionId:"session:001",
      requestId:"request:001",
      correlationId:"correlation:001",
      locale:"es-MX",
      parts:[{type:"text",text:"Hola"}],
      capabilities:["text"],
    },
  });

  assert.equal(result.status,200);
  assert.equal(result.payload.output.parts[0].text,"Hola desde uni.co");
  assert.equal(seen.access.length,1);
  assert.equal(seen.access[0].productId,"product:uni-co");
  assert.equal(seen.access[0].tenantId,"tenant:001");

  assert.equal(seen.upstream.length,1);
  const call=seen.upstream[0];
  assert.equal(call.options.headers["x-unico-api-key"],TECHNICAL_KEY);
  assert.equal(call.options.headers["x-tenant-id"],"tenant:001");
  const body=JSON.parse(call.options.body);
  assert.equal(body.agentId,"uni.co");
  assert.equal(body.locale,"es-MX");
  assert.equal(body.context.currency,"MXN");
  assert.equal(body.context.clegalRegion,"MX");
  assert.equal(body.context.timezone,"America/Mexico_City");
  assert.equal("productId" in body,false);
  assert.equal("principalId" in body,false);
  assert.equal("sessionId" in body,false);
});

test("shadow browser composition is not constructible without server-side runtime config",()=>{
  assert.throws(()=>createWebAgentShadowBrowserComposition({}),/shadowRuntime/);
});
