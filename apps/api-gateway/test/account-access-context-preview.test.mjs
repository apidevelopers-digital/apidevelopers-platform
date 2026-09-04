import test from"node:test";
import assert from"node:assert/strict";
import{mkdtemp,rm}from"node:fs/promises";
import{tmpdir}from"node:os";
import{join}from"node:path";
import{createJsonFileStore}from"@apidevelopers/persistence-core";
import{createUniCoPreviewAuthenticationEvidence}from"../src/web-agent-preview-authentication-evidence.mjs";
import{createPreviewAccountAccessContextResolver,AccountAccessContextResolutionError}from"../src/account-access-context-preview.mjs";
import{createAccountAccessContextHttpApp,accountAccessContextResolvePath}from"../src/account-access-context-http.mjs";
import{createUniAccountPreviewAccessContextComposition}from"../src/account-access-context-preview-composition.mjs";
const T0="2026-09-04T10:00:00.000Z",T1="2026-09-04T10:30:00.000Z";
test("preview authentication evidence is aal1/password and contains no secret material",()=>{
 const e=createUniCoPreviewAuthenticationEvidence({principalId:"principal.preview.igor",tenantId:"tenant.preview.igor",authenticatedAt:T0,expiresAt:T1,idFactory:()=>"fixture123"});
 assert.equal(e.authenticationContext.assuranceLevel,"aal1");assert.deepEqual(e.authenticationContext.methods,["password"]);assert.equal(e.policyDecision.effect,"allow");assert.equal(e.secretMaterialIncluded,false);assert.equal(e.principalId,"principal.preview.igor");assert.equal(e.tenantId,"tenant.preview.igor");
});
test("account access resolver fails closed when canonical tenant is absent",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"account-context-"));const store=createJsonFileStore({filePath:join(dir,"state.json"),fsync:false,clock:()=>T0});
 try{const r=createPreviewAccountAccessContextResolver({store,clock:()=>new Date(T0)});await assert.rejects(()=>r.resolve({accountId:"principal.preview.igor",tenantId:"component.tenant.missing"}),e=>e instanceof AccountAccessContextResolutionError&&e.status===403)}finally{await rm(dir,{recursive:true,force:true})}
});
test("HTTP resolver requires the fixed server consumer and returns no-store",async()=>{
 const base={handleRequest:async()=>({status:404})};const resolver={resolve:async({accountId,tenantId})=>({accountId,tenantId,organizationId:"component.organization.demo"})};
 const good={authenticate:async()=>({role:"server",principal:{id:"server.site-uni-preview"}})};
 const http=createAccountAccessContextHttpApp({app:base,resolver,consumerAuthenticator:good,consumerPrincipalId:"server.site-uni-preview"});
 const ok=await http.app.handleRequest({method:"POST",url:accountAccessContextResolvePath,headers:{authorization:"Bearer runtime-only"},body:{accountId:"principal.preview.igor",tenantId:"tenant.preview.igor"}});
 assert.equal(ok.status,200);assert.equal(ok.headers["cache-control"],"no-store");assert.equal(JSON.parse(ok.body).context.organizationId,"component.organization.demo");
 const bad=createAccountAccessContextHttpApp({app:base,resolver,consumerAuthenticator:{authenticate:async()=>({role:"server",principal:{id:"server.other"}})},consumerPrincipalId:"server.site-uni-preview"});
 assert.equal((await bad.app.handleRequest({method:"POST",url:accountAccessContextResolvePath,headers:{},body:{accountId:"a",tenantId:"b"}})).status,401);
});
test("preview composition is disabled by default and never auto-wires runtime",()=>{
 const base={handleRequest:async()=>({status:404})};const c=createUniAccountPreviewAccessContextComposition({app:base});
 assert.equal(c.enabled,false);assert.equal(c.descriptor.productionEnabled,false);assert.equal(c.descriptor.runtimeAutoWiring,false);
});