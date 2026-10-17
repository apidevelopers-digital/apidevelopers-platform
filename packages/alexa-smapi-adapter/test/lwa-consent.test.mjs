import test from "node:test";
import assert from "node:assert/strict";
import {createLwaConsent} from "../src/lwa-consent.mjs";
const code="AUTHORIZATION_CODE_123";
function harness({status=200,vaultFails=false,clock={time:0}}={}){
  const pend=new Map(),calls=[],saved=[];let seq=0;
  const flow=createLwaConsent({
    clientId:"amzn.test.client",redirectUri:"https://example.org/cb",
    randomBytesImpl:()=>Buffer.alloc(32,++seq),now:()=>clock.time,
    createPending:async(k,v)=>pend.set(k,v),
    consumePending:async(k)=>{const v=pend.get(k);pend.delete(k);return v;},
    getClientSecret:async()=>"FAKE_ONLY",
    saveRefreshToken:async(v)=>{if(vaultFails)throw Error("hidden");saved.push(v);},
    fetchImpl:async(url,options)=>{calls.push({url,options});return {
      ok:status===200,status,json:async()=>({
        access_token:"FAKE_ACCESS",refresh_token:"FAKE_REFRESH",
        token_type:"bearer",expires_in:3600
      })
    };}
  });
  const callback=(url)=>"https://example.org/cb?state="+
    new URL(url).searchParams.get("state")+"&code="+code;
  return {flow,pend,calls,saved,clock,callback};
}
test("read scope, fresh state and PKCE S256",async()=>{
  const x=harness(),a=await x.flow.begin({principal:"igor"}),b=await x.flow.begin({principal:"igor"});
  const u=new URL(a.authorizationUrl);
  assert.equal(u.origin+u.pathname,"https://www.amazon.com/ap/oa");
  assert.equal(u.searchParams.get("scope"),"alexa::ask:skills:read");
  assert.equal(u.searchParams.get("code_challenge_method"),"S256");
  assert.notEqual(u.searchParams.get("state"),new URL(b.authorizationUrl).searchParams.get("state"));
  assert.equal(u.searchParams.has("code_verifier"),false);
});
test("exchange is single-use and vault precedes success",async()=>{
  const x=harness(),a=await x.flow.begin({principal:"igor"});
  assert.equal((await x.flow.finish({principal:"igor",callbackUrl:x.callback(a.authorizationUrl)})).connected,true);
  assert.equal(x.saved[0].refreshToken,"FAKE_REFRESH");
  assert.equal(x.calls[0].url,"https://api.amazon.com/auth/o2/token");
  await assert.rejects(x.flow.finish({principal:"igor",callbackUrl:x.callback(a.authorizationUrl)}),/expired_state/);
});
test("foreign principal and expired callback are rejected",async()=>{
  const x=harness(),a=await x.flow.begin({principal:"igor"});
  await assert.rejects(x.flow.finish({principal:"other",callbackUrl:x.callback(a.authorizationUrl)}),/expired_state/);
  const b=await x.flow.begin({principal:"igor"});x.clock.time=300001;
  await assert.rejects(x.flow.finish({principal:"igor",callbackUrl:x.callback(b.authorizationUrl)}),/expired_state/);
  assert.equal(x.calls.length,0);
});
test("forged callback and consent denial never exchange token",async()=>{
  const x=harness(),a=await x.flow.begin({principal:"igor"});
  await assert.rejects(x.flow.finish({principal:"igor",callbackUrl:x.callback(a.authorizationUrl).replace("example.org","evil.org")}),/invalid_callback/);
  await assert.rejects(x.flow.finish({principal:"igor",callbackUrl:x.callback(a.authorizationUrl).replace("&code="+code,"&error=access_denied")}),/consent_denied/);
  assert.equal(x.calls.length,0);
});
test("failed token API or failed vault block successful connection",async()=>{
  const a=harness({status:401}),p=await a.flow.begin({principal:"igor"});
  await assert.rejects(a.flow.finish({principal:"igor",callbackUrl:a.callback(p.authorizationUrl)}),/lwa_exchange_http_401/);
  const b=harness({vaultFails:true}),q=await b.flow.begin({principal:"igor"});
  await assert.rejects(b.flow.finish({principal:"igor",callbackUrl:b.callback(q.authorizationUrl)}),/secret_storage_failed/);
});
test("rejects insecure redirect, missing store and invalid identity",async()=>{
  assert.throws(()=>createLwaConsent({clientId:"abc",redirectUri:"http://bad.example/cb"}),/invalid_lwa_redirect/);
  assert.throws(()=>createLwaConsent({clientId:"abc",redirectUri:"https://example.org/cb"}),/missing_dependency/);
  await assert.rejects(harness().flow.begin({principal:"../igor"}),/invalid_authenticated_principal/);
});
