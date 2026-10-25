import assert from "node:assert/strict";
import test from "node:test";
import {
  createMcpStagingHandoffContext, McpStagingHandoffError,
  MCP_STAGING_HANDOFF_TARGET_ORIGIN as origin,
  MCP_STAGING_HANDOFF_CONTEXT_V1 as version,
} from "../src/mcp-staging-handoff-context.mjs";

const scope = "mcp:tools:read";
const issuedAt = "2026-10-25T12:00:30.000Z";
const authenticatedAt = "2026-10-25T11:58:00.000Z";
const proofId = "proof:test-only-unique-redeem-123";
const request = () => ({
  code: "A".repeat(43), codeVerifier: "v".repeat(43), requestedScopes: [scope],
});
const failed = (code) => (e) => e instanceof McpStagingHandoffError && e.code === code;
const proof = ({ principal = {}, source = {}, ...other } = {}) => ({
  authenticated: true,
  principal: {
    id: "acct_123", tenantId: "tenant:test", status: "active",
    scopes: [scope], ...principal,
  },
  source: {
    authenticationMethod: "browser_session_handoff", browserBindingMethod: "S256",
    targetOrigin: origin, issuedAt, redemptionProofId: proofId,
    redeemerId: "svc:mcp-staging", ...source,
  },
  ...other,
});
const evidence = (other = {}) => ({
  active: true, revoked: false, principalId: "acct_123", tenantId: "tenant:test",
  handoffIssuedAt: issuedAt, redemptionProofId: proofId, subject: "user:acct_123",
  authenticatedAt, sessionExpiresAt: "2026-10-25T12:05:00.000Z",
  policyDecision: "allow", policyDecisionId: "policy:mock-allow",
  userScopes: [scope], policyAllowedScopes: [scope], ...other,
});
const context = ({
  redeemed = proof(), session = evidence(), redeemHandoff = async () => redeemed,
  resolveSessionEvidence = async () => session, ...other
} = {}) => createMcpStagingHandoffContext({
  enabled: true, expectedTenantId: "tenant:test", expectedRedeemerId: "svc:mcp-staging",
  clientAllowedScopes: [scope], tenantAllowedScopes: [scope],
  now: () => new Date("2026-10-25T12:00:45.000Z"),
  redeemHandoff, resolveSessionEvidence, ...other,
});

test("disabled by default never calls an injected provider", async () => {
  const gate = createMcpStagingHandoffContext({
    redeemHandoff() { throw new Error("must not call"); },
  });
  assert.equal(gate.enabled, false);
  assert.equal(gate.productionEnabled, false);
  await assert.rejects(gate.verify(request()), failed("mcp_staging_handoff_disabled"));
});

test("requires exact staging origin, trusted backends and scope policy", () => {
  for (const bad of ["https://mcp.apidevelopers.digital", `${origin}.attacker.tld`]) {
    assert.throws(() => context({ targetOrigin: bad }), failed("staging_target_not_allowed"));
  }
  assert.throws(() => createMcpStagingHandoffContext({
    enabled: true, expectedTenantId: "tenant:test", expectedRedeemerId: "svc:mcp-staging",
  }), failed("trusted_backends_required"));
  assert.throws(() => context({ clientAllowedScopes: [] }), failed("scopes_required"));
});

test("successful contract yields original auth time, policy evidence and pinned redeem", async () => {
  const calls = [];
  const gate = context({
    redeemHandoff: async (args) => { calls.push(args); return proof(); },
    resolveSessionEvidence: async (args) => { calls.push(args); return evidence(); },
  });
  const response = await gate.verify(request());
  assert.equal(response.version, version);
  assert.equal(response.productionEnabled, false);
  assert.deepEqual(response.authorizedScopes, [scope]);
  assert.deepEqual(response.authorizationSubject, {
    subject: "user:acct_123", tenant_id: "tenant:test",
    audience: "mcp-plugin-gateway", auth_time: Date.parse(authenticatedAt) / 1000,
  });
  assert.deepEqual(calls, [
    { code: "A".repeat(43), codeVerifier: "v".repeat(43), targetOrigin: origin },
    { principalId: "acct_123", tenantId: "tenant:test",
      handoffIssuedAt: issuedAt, redemptionProofId: proofId },
  ]);
});

test("redeem failure is sanitized; evidence provider is not called", async () => {
  let called = false;
  const gate = context({
    redeemHandoff: async () => { throw new Error("secret error"); },
    resolveSessionEvidence: async () => { called = true; return evidence(); },
  });
  await assert.rejects(gate.verify(request()), failed("handoff_redemption_failed"));
  assert.equal(called, false);
});

test("rejects forged handoff, wrong tenant and downgraded binding", async () => {
  const invalid = [
    proof({ authenticated: false }),
    proof({ principal: { tenantId: "tenant:attacker" } }),
    proof({ principal: { status: "revoked" } }),
    proof({ source: { targetOrigin: "https://attacker.tld" } }),
    proof({ source: { browserBindingMethod: "plain" } }),
    proof({ source: { authenticationMethod: "header" } }),
    proof({ source: { redeemerId: "svc:other" } }),
    proof({ source: { redemptionProofId: "" } }),
  ];
  for (const redeemed of invalid) {
    await assert.rejects(context({ redeemed }).verify(request()), failed("handoff_identity_invalid"));
  }
});

test("rejects stale original login; recent handoff cannot refresh auth_time", async () => {
  await assert.rejects(context({
    session: evidence({ authenticatedAt: "2026-10-25T11:00:00.000Z" }),
  }).verify(request()), failed("authentication_stale"));
});

test("rejects future/expired handoff", async () => {
  for (const at of ["2026-10-25T11:55:00.000Z", "2026-10-25T12:02:00.000Z"]) {
    await assert.rejects(context({
      redeemed: proof({ source: { issuedAt: at } }),
    }).verify(request()), failed("handoff_expired"));
  }
});

test("rejects missing, revoked, cross-tenant and unbound evidence", async () => {
  for (const session of [
    null, evidence({ active: false }), evidence({ revoked: true }),
    evidence({ tenantId: "tenant:other" }), evidence({ principalId: "acct:attacker" }),
    evidence({ handoffIssuedAt: "2026-10-25T12:00:31.000Z" }),
    evidence({ redemptionProofId: "proof:unrelated" }),
    evidence({ policyDecision: "deny" }), evidence({ policyDecisionId: "" }),
  ]) {
    await assert.rejects(context({ session }).verify(request()), (e) =>
      e instanceof McpStagingHandoffError &&
      ["session_evidence_missing", "session_evidence_invalid"].includes(e.code));
  }
});

test("five independent allowlists prevent scope escalation", async () => {
  const write = "mcp:tools:write";
  const both = [scope, write];
  const args = { ...request(), requestedScopes: both };
  for (const variant of [
    { clientAllowedScopes: [scope] }, { tenantAllowedScopes: [scope] },
    { redeemed: proof({ principal: { scopes: [scope] } }) },
    { session: evidence({ userScopes: [scope] }) },
    { session: evidence({ policyAllowedScopes: [scope] }) },
  ]) {
    await assert.rejects(context({
      clientAllowedScopes: both, tenantAllowedScopes: both,
      redeemed: proof({ principal: { scopes: both } }),
      session: evidence({ userScopes: both, policyAllowedScopes: both }),
      ...variant,
    }).verify(args), failed("scope_not_authorized"));
  }
});

test("preview web:chat session cannot acquire mcp:tools:read", async () => {
  await assert.rejects(context({
    redeemed: proof({ principal: { scopes: ["web:chat"] } }),
  }).verify(request()), failed("scope_not_authorized"));
});

test("input validation precedes redemption", async () => {
  let called = false;
  const gate = context({
    redeemHandoff: async () => { called = true; return proof(); },
  });
  await assert.rejects(gate.verify({ ...request(), requestedScopes: [scope, scope] }),
    failed("duplicate_scopes"));
  await assert.rejects(gate.verify({ ...request(), requestedScopes: ["*"] }),
    failed("scopes_invalid"));
  assert.equal(called, false);
});

test("expired session and evidence server errors are rejected", async () => {
  await assert.rejects(context({
    session: evidence({ sessionExpiresAt: "2026-10-25T12:00:00.000Z" }),
  }).verify(request(), failed("authentication_stale"));
  await assert.rejects(context({
    resolveSessionEvidence: async () => { throw new Error("backend unavailable"); },
  }).verify(request(), failed("session_evidence_unavailable"));
});

test("no HTTP app or production entry point is exposed", () => {
  const gate = context();
  assert.equal(gate.productionEnabled, false);
  assert.equal(Object.hasOwn(gate, "app"), false);
  assert.equal(Object.hasOwn(gate, "handleRequest"), false);
});
