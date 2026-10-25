import assert from "node:assert/strict";
import test from "node:test";
import { createMcpStagingHandoffContext as create, McpStagingHandoffError as ErrorType,
  MCP_STAGING_HANDOFF_TARGET_ORIGIN as origin } from "../src/mcp-staging-handoff-context.mjs";

const S = "mcp:tools:read", W = "mcp:tools:write";
const issuedAt = "2026-10-25T12:00:30.000Z", authenticatedAt = "2026-10-25T11:58:00.000Z";
const request = () => ({code:"A".repeat(43),codeVerifier:"v".repeat(43),requestedScopes:[S]});
const fail = code => e => e instanceof ErrorType && e.code === code;
const proof = (p={},s={}) => ({authenticated:true,
  principal:{id:"acct_123",tenantId:"tenant:test",status:"active",scopes:[S],...p},
  source:{authenticationMethod:"browser_session_handoff",browserBindingMethod:"S256",
    targetOrigin:origin,issuedAt,redemptionProofId:"proof:123",redeemerId:"svc:mcp-staging",...s}});
const evidence = (e={}) => ({active:true,revoked:false,principalId:"acct_123",
  tenantId:"tenant:test",handoffIssuedAt:issuedAt,redemptionProofId:"proof:123",
  subject:"user:acct_123",authenticatedAt,sessionExpiresAt:"2026-10-25T12:05:00.000Z",
  policyDecision:"allow",policyDecisionId:"policy:123",userScopes:[S],
  policyAllowedScopes:[S],...e});
function gate(o={}) {
  const redeemed = o.redeemed ?? proof(), session = o.session === undefined ? evidence() : o.session;
  return create({enabled:true,expectedTenantId:"tenant:test",expectedRedeemerId:"svc:mcp-staging",
    clientAllowedScopes:[S],tenantAllowedScopes:[S],
    now:()=>new Date("2026-10-25T12:00:45.000Z"),
    redeemHandoff:async()=>redeemed,resolveSessionEvidence:async()=>session,...o});
}
const deny=async (g,c,r=request())=>assert.rejects(g.verify(r),fail(c));

test("disabled by default",async()=>{
  const g=create({redeemHandoff:()=>{throw new Error("called");}});
  assert.equal(g.enabled,false);assert.equal(g.productionEnabled,false);
  await deny(g,"mcp_staging_handoff_disabled");
});
test("pin origin and required dependencies",()=>{
  assert.throws(()=>gate({targetOrigin:"https://mcp.apidevelopers.digital"}),fail("staging_target_not_allowed"));
  assert.throws(()=>create({enabled:true,expectedTenantId:"tenant:test",expectedRedeemerId:"svc:mcp-staging"}),fail("trusted_backends_required"));
  assert.throws(()=>gate({clientAllowedScopes:[]}),fail("scopes_required"));
});
test("valid verified identity returns original auth time and scopes",async()=>{
  const calls=[];
  const g=gate({redeemHandoff:async a=>(calls.push(a),proof()),
    resolveSessionEvidence:async a=>(calls.push(a),evidence())});
  const v=await g.verify(request());
  assert.equal(v.productionEnabled,false);
  assert.deepEqual(v.authorizedScopes,[S]);
  assert.deepEqual(v.authorizationSubject,{subject:"user:acct_123",tenant_id:"tenant:test",
    audience:"mcp-plugin-gateway",auth_time:Date.parse(authenticatedAt)/1000});
  assert.equal(calls[0].targetOrigin,origin);
  assert.equal(calls[1].redemptionProofId,"proof:123");
});
test("redemption failure is sanitized and stops evidence lookup",async()=>{
  let called=false;
  await deny(gate({redeemHandoff:async()=>{throw new Error("secret");},
    resolveSessionEvidence:async()=>{called=true;return evidence();}}),"handoff_redemption_failed");
  assert.equal(called,false);
});
test("forged proof and wrong tenant fail closed",async()=>{
  for(const [p,s] of [[{tenantId:"tenant:other"},{}],[{status:"revoked"},{}],
    [{},{browserBindingMethod:"plain"}],[{},{authenticationMethod:"header"}],
    [{},{redeemerId:"svc:other"}],[{},{redemptionProofId:""}],
    [{},{targetOrigin:"https://attacker.example"}]]) {
    await deny(gate({redeemed:proof(p,s)}),"handoff_identity_invalid");
  }
});
test("anonymous proof fails closed",async()=>{
  await deny(gate({redeemed:{...proof(),authenticated:false}}),"handoff_identity_invalid");
});
test("stale original login fails despite fresh handoff",async()=>{
  await deny(gate({session:evidence({authenticatedAt:"2026-10-25T11:00:00.000Z"})}),"authentication_stale");
});
test("future or expired handoff fails",async()=>{
  for(const at of ["2026-10-25T11:55:00.000Z","2026-10-25T12:02:00.000Z"])
    await deny(gate({redeemed:proof({}, {issuedAt:at})}),"handoff_expired");
});
test("missing, revoked, cross tenant, unbound or denied session fails",async()=>{
  for(const session of [null,evidence({active:false}),evidence({revoked:true}),
    evidence({tenantId:"tenant:other"}),evidence({redemptionProofId:"proof:forged"}),
    evidence({handoffIssuedAt:"2026-10-25T12:00:31.000Z"}),
    evidence({policyDecision:"deny"}),evidence({policyDecisionId:""})]) {
    await assert.rejects(gate({session}).verify(request()),e=>e instanceof ErrorType &&
      ["session_evidence_missing","session_evidence_invalid"].includes(e.code));
  }
});
test("five independent scope lists reject escalation",async()=>{
  for(const o of [{clientAllowedScopes:[S]},{tenantAllowedScopes:[S]},
    {redeemed:proof({scopes:[S]})},{session:evidence({userScopes:[S]})},
    {session:evidence({policyAllowedScopes:[S]})}]) {
    await deny(gate({clientAllowedScopes:[S,W],tenantAllowedScopes:[S,W],
      redeemed:proof({scopes:[S,W]}),session:evidence({userScopes:[S,W],policyAllowedScopes:[S,W]}),
      ...o}),"scope_not_authorized",{...request(),requestedScopes:[S,W]});
  }
});
test("preview web:chat alone never grants MCP read",async()=>{
  await deny(gate({redeemed:proof({scopes:["web:chat"]})}),"scope_not_authorized");
});
test("invalid scopes reject before backend invocation",async()=>{
  let called=false;const g=gate({redeemHandoff:async()=>{called=true;return proof();}});
  await deny(g,"duplicate_scopes",{...request(),requestedScopes:[S,S]});
  await deny(g,"scopes_invalid",{...request(),requestedScopes:["*"]});
  assert.equal(called,false);
});
test("expired session and evidence backend outage fail closed",async()=>{
  await deny(gate({session:evidence({sessionExpiresAt:"2026-10-25T12:00:00.000Z"})}),"authentication_stale");
  await deny(gate({resolveSessionEvidence:async()=>{throw new Error("down");}}),"session_evidence_unavailable");
});
test("not mounted: no HTTP app or production entrypoint",()=>{
  const g=gate();assert.equal(g.productionEnabled,false);
  assert.equal(Object.hasOwn(g,"app"),false);assert.equal(Object.hasOwn(g,"handleRequest"),false);
});
