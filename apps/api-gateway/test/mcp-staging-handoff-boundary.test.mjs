import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { createBrowserSessionHandoffService } from "../../../packages/auth-core/src/browser-session-handoff.mjs";
import { createMcpStagingHandoffBoundary as create, MCP_STAGING_READ_SCOPE as READ } from "../src/mcp-staging-handoff-boundary.mjs";

const TARGET = "https://mcp-staging.apidevelopers.digital";
const verifier = "z".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("base64url");

function stateStore() {
  const records = new Map();
  return {
    async putIfAbsent(k, v) { if (records.has(k)) return false; records.set(k, v); return true; },
    async take(k) { const v = records.get(k) ?? null; records.delete(k); return v; },
    size() { return records.size; },
  };
}
function source({ tenant = "tenant:test", scopes = [READ, "admin:*"], status = "active" } = {}) {
  return { async authenticate(headers) {
    if (headers.cookie !== "authenticated-session") return null;
    return { role: "client", principal: { id: "user:test", tenantId: tenant, scopes, status } };
  }};
}
function server(id = "server:mcp-staging") {
  return { async authenticate(headers) {
    return headers.authorization === "Bearer test-server" ? { role: "server", principal: { id } } : null;
  }};
}
function make(options = {}) {
  return create({
    enabled: true, approvedTargetOrigin: TARGET, expectedTenantId: "tenant:test",
    expectedRedeemerId: "server:mcp-staging", sourceAuthenticator: source(),
    redeemerAuthenticator: server(), store: stateStore(),
    createService: createBrowserSessionHandoffService, ...options,
  });
}
const issue = (b, overrides = {}) => b.issue({
  sourceHeaders: { cookie: "authenticated-session" },
  targetOrigin: TARGET, codeChallenge: challenge, ...overrides,
});
const redeem = (b, code, overrides = {}) => b.redeem({
  serverHeaders: { authorization: "Bearer test-server" },
  code, codeVerifier: verifier, ...overrides,
});

test("inert by default and never enables OAuth grants", () => {
  const b = create();
  assert.equal(b.enabled, false);
  assert.equal(b.issue, undefined);
  assert.equal(b.descriptor.oauthGrantsEnabled, false);
  assert.equal(b.descriptor.productionEnabled, false);
});
test("missing authenticators, atomic store or official service fail closed", () => {
  assert.throws(() => create({ enabled: true, approvedTargetOrigin: TARGET,
    expectedTenantId: "tenant:test", expectedRedeemerId: "server:mcp-staging" }), /requires/);
});
test("only an exact staging HTTPS origin is accepted", () => {
  for (const origin of [
    "http://mcp-staging.apidevelopers.digital",
    "https://api.apidevelopers.digital",
    "https://uni-preview.apidevelopers.digital",
    "https://mcp-staging.evil.example",
    `${TARGET}/path`, `https://admin@mcp-staging.apidevelopers.digital`,
    `${TARGET}:4443`,
  ]) assert.throws(() => make({ approvedTargetOrigin: origin }), /approvedTargetOrigin/);
});
test("no session, forged header, wrong tenant or missing scope: no handoff", async () => {
  const b = make();
  await assert.rejects(issue(b, { sourceHeaders: { "x-authenticated-user": "admin" } }),
    { code: "source_session_required" });
  for (const auth of [source({ tenant: "tenant:other" }),
                      source({ scopes: ["web:chat"] }),
                      source({ status: "revoked" })]) {
    await assert.rejects(issue(make({ sourceAuthenticator: auth })),
      { code: "source_session_required" });
  }
});
test("wrong target rejected before persisting any handoff", async () => {
  const store = stateStore();
  await assert.rejects(issue(make({ store }), { targetOrigin: "https://attacker.example" }),
    { code: "staging_target_mismatch" });
  assert.equal(store.size(), 0);
});
test("only exact server identity can redeem, without consuming on denial", async () => {
  const b = make();
  const issued = await issue(b);
  await assert.rejects(redeem(b, issued.code, { serverHeaders: {} }),
    { code: "staging_redeemer_unauthorized" });
  const ok = await redeem(b, issued.code);
  assert.equal(ok.principal.tenantId, "tenant:test");
  const wrong = make({ redeemerAuthenticator: server("server:other") });
  const issuedWrong = await issue(wrong);
  await assert.rejects(redeem(wrong, issuedWrong.code), { code: "staging_redeemer_unauthorized" });
});
test("valid one-time handoff uses S256, downscopes privileges and cannot authorize OAuth", async () => {
  const b = make();
  const issued = await issue(b);
  const result = await redeem(b, issued.code);
  assert.deepEqual(result.principal.scopes, [READ]);
  assert.equal(result.source.targetOrigin, TARGET);
  assert.equal(result.source.browserBindingMethod, "S256");
  assert.equal(result.oauthGrantsEnabled, false);
  assert.equal(result.originalAuthenticationTimeVerified, false);
  await assert.rejects(redeem(b, issued.code), { code: "handoff_invalid_expired_or_redeemed" });
});
test("bad verifier consumes the code and cannot be replayed", async () => {
  const b = make(); const issued = await issue(b);
  await assert.rejects(redeem(b, issued.code, { codeVerifier: "x".repeat(64) }),
    { code: "handoff_browser_binding_mismatch" });
  await assert.rejects(redeem(b, issued.code), { code: "handoff_invalid_expired_or_redeemed" });
});
test("server auth outage is a fail-closed 503", async () => {
  const b = make({ redeemerAuthenticator: { async authenticate() { throw Error("down"); } } });
  const issued = await issue(b);
  await assert.rejects(redeem(b, issued.code), { code: "staging_server_auth_unavailable", status: 503 });
});
test("service lacking atomic one-time S256 guarantees cannot be used", () => {
  assert.throws(() => make({ createService: () => ({
    issue() {}, redeem() {}, descriptor: { oneTimeRedemptionRequired: false },
  }) }), /one-time S256-bound/);
});
