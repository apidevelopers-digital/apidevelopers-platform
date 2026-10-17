import test from "node:test";
import assert from "node:assert/strict";
import {createLwaConsent} from "../src/lwa-consent.mjs";
function mock({status=200,vaultFails=false,payload,clock={t:0}}={}){
  const state=new Map(), calls=[],saved=[];let n=0;
  const flow=createLwaConsent({
    clientId:"amzn.test.client",redirectUri:"https://example.org/cb",
    randomBytesImpl:()=>Buffer.alloc(32,++n),now:()=>clock.t,
    createPending:async(k,v)=>{state.set(k,v);},
    consumePending:async(k)=>{const v=state.get(k);state.delete(k);return v;},
    getClientSecret:async()=>"NOT_A_REAL_SECRET",
    saveRefreshToken:async(v)=>{if(vaultFails)throw Error("private");saved.push(v);},
    fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return {ok:status===200,status,json:async()=>payload??{
        access_token:"TEST_ACCESS",refresh_token:"TEST_REFRESH",token_type:"bearer",expires_in:3600
      }};
    }
  });
  return {flow,state,calls,saved,clock};
}
function cb(url){
  return "https://example.org/cb?state="+new URL(url).searchParams.get("state")+"&code=AUTHORIZATION_CODE_123";
}
test("read-only scope, PKCE S256 and random state",async()=>{
  const m=mock(),a=await m.flow.begin({principal:"igor"}),b=await m.flow.begin({principal:"igor"});
  const u=new URL(a.authorizationUrl);
  assert.equal(u.origin+u.pathname,"https://www.amazon.com/ap/oa");
  assert.equal(u.searchParams.get("scope"),"alexa::ask:skills:read");
  assert.equal(u.searchParams.get("code_challenge_method"),"S256");
  assert.notEqual(u.searchParams.get("state"),new URL(b.authorizationUrl).searchParams.get("state"));
  assert.equal(u.searchParams.has("code_verifier"),false);
});
test("exchanges code once and saves refresh token",async()=>{
  const m=mock(),a=await m.flow.begin({principal:"igor"});
  assert.equal((await m.flow.finish({principal:"igor",callbackUrl:cb(a.authorizationUrl)})).connected,true);
  assert.equal(m.saved[0].refreshToken,"TEST_REFRESH");
  assert.equal(m.calls[0].url,"https://api.amazon.com/auth/o2/token");
  assert.equal(new URLSearchParams(m.calls[0].options.body).get("grant_type"),"authorization_code");
  await assert.rejects(m.flow.finish({principal:"igor",callbackUrl:cb(a.authorizationUrl)}),/expired_state/);
});
test("wrong principal and expired state fail closed",async()=>{
  const m=mock(),a=await m.flow.begin({principal:"igor"});
  await assert.rejects(m.flow.finish({principal:"other",callbackUrl:cb(a.authorizationUrl)}),/expired_state/);
  const b=await m.flow.begin({principal:"igor"});m.clock.t=300001;
  await assert.rejects(m.flow.finish({principal:"igor",callbackUrl:cb(b.authorizationUrl)}),/expired_state/);
  assert.equal(m.calls.length,0);
});
test("wrong callback URL and declined consent cause no exchange",async()=>{
  const m=mock(),a=await m.flow.begin({principal:"igor"});
  await assert.rejects(m.flow.finish({principal:"igor",callbackUrl:cb(a.authorizationUrl).replace("example.org","evil.org")}),/invalid_callback/);
  await assert.rejects(m.flow.finish({principal:"igor",callbackUrl:cb(a.authorizationUrl).replace(/&code=.*/,"&error=access_denied")}),/consent_denied/);
  assert.equal(m.calls.length,0);
});
test("token API failure and incomplete token payload cannot connect",async()=>{
  const a=mock({status:401}),p=await a.flow.begin({principal:"igor"});
  await assert.rejects(a.flow.finish({principal:"igor",callbackUrl:cb(p.authorizationUrl)}),/^Error: lwa_exchange_http_401$/);
  const b=mock({payload:{access_token:"x",token_type:"bearer",expires_in:3600}});
  const q=await b.flow.begin({principal:"igor"});
  await assert.rejects(b.flow.finish({principal:"igor",callbackUrl:cb(q.authorizationUrl)}),/invalid_token_response/);
});
test("vault errors prevent connection success",async()=>{
  const m=mock({vaultFails:true}),a=await m.flow.begin({principal:"igor"});
  await assert.rejects(m.flow.finish({principal:"igor",callbackUrl:cb(a.authorizationUrl)}),/secret_storage_failed/);
});
test("requires HTTPS redirect, authenticated principal and state store",async()=>{
  assert.throws(()=>createLwaConsent({clientId:"abc",redirectUri:"http://bad.example/cb"}),/invalid_lwa_redirect/);
  assert.throws((()=>createLwaConsent({clientId:"abc",redirectUri:"https://example.org/cb"}),/missing_dependency/);
  await assert.rejects(mock().flow.begin({principal:"../igor"}),/invalid_authenticated_principal/);
});
