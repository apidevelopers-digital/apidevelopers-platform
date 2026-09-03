import assert from "node:assert/strict";
import test from "node:test";
import { createBrowserSessionAuthenticator, hashBrowserSessionSecret } from "../src/browser-session-authenticator.mjs";
import { BIOMETRIC_BROWSER_SESSION_ISSUER_V1 as P, createBiometricBrowserSessionIssuer as make } from "../src/biometric-browser-session-issuer-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;
const decision = (x = {}) => ({
  version: "trust-biometric-login-decision/v1",
  mode: "sandbox-conformance",
  status: "authorized",
  authentication: { method: "trust_biometric_face_sandbox", modality: "face", verificationId: "v1", providerId: "trust-face-sandbox", policyId: "bp1", policyDigest: D("a"), policyProductionValidated: false },
  identity: { role: "client", principal: { id: "p1", tenantId: "t1", status: "active", scopes: ["product:read"], authenticationMethod: "trust_biometric_face_sandbox" } },
  access: { allowed: true, tenantId: "t1", workspaceId: "w1", productId: "prod1", accessGrantId: "g1" },
  session: { issuanceAllowed: false, issued: false, nextStage: "auth-core-session-issuance" },
  rawBiometricMaterialForwarded: false,
  rawBiometricMaterialPersisted: false,
  productionAuthorized: false,
  productionReady: false,
  ...x,
});

function harness(over = {}) {
  const records = new Map();
  let persisted = 0;
  let randomCalls = 0;
  const s = make({
    persistSession: over.persistSession || (async (r) => { persisted += 1; records.set(r.secretHash, r); return true; }),
    authorizeSessionIssuance: over.policy || (async () => ({ allowed: true, policyId: "sp1", policyDigest: D("b"), productionValidated: false })),
    randomBytes: () => { randomCalls += 1; return Buffer.alloc(32, 7); },
    createSessionId: () => "session-1",
    now: () => new Date("2026-09-03T04:00:00Z"),
    maxAgeSeconds: 900,
  });
  return { s, records, counts: () => ({ persisted, randomCalls }) };
}
const run = (s, d = decision()) => s.issue({ loginDecision: d });

test("profile remains sandbox", () => {
  assert.equal(P.productionEnabled, false);
  assert.equal(P.sessionSecretPersisted, false);
});

test("issued cookie round-trips to the same principal", async () => {
  const h = harness();
  const out = await run(h.s);
  const pair = out.setCookieHeader.split(";")[0];
  const secret = pair.split("=")[1];
  const stored = h.records.get(hashBrowserSessionSecret(secret));
  assert.ok(stored);
  assert.equal(stored.sessionSecret, undefined);
  const auth = createBrowserSessionAuthenticator({ resolveSessionByHash: async (q) => h.records.get(q) || null, now: () => new Date("2026-09-03T04:01:00Z") });
  const id = await auth.authenticate({ cookie: pair });
  assert.equal(id.principal.id, "p1");
  assert.equal(out.productionReady, false);
});

test("policy denial happens before randomness", async () => {
  const h = harness({ policy: async () => ({ allowed: false, reason: "step_up" }) });
  await assert.rejects(() => run(h.s), (e) => e.code === "session_issuance_denied");
  assert.deepEqual(h.counts(), { persisted: 0, randomCalls: 0 });
});

test("denied login decision is rejected", async () => {
  const h = harness();
  await assert.rejects(() => run(h.s, decision({ status: "denied" })), (e) => e.code === "login_decision_not_authorized");
});

test("production source is rejected", async () => {
  const h = harness();
  await assert.rejects(() => run(h.s, decision({ productionAuthorized: true })), (e) => e.code === "production_not_authorized");
});

test("raw biometric material is rejected before policy", async () => {
  let policyCalls = 0;
  const h = harness({ policy: async () => { policyCalls += 1; return { allowed: true, policyId: "p", policyDigest: D("c"), productionValidated: false }; } });
  await assert.rejects(() => run(h.s, decision({ rawImage: "x" })), (e) => e.code === "sensitive_material_forbidden");
  assert.equal(policyCalls, 0);
});

test("tenant mismatch is rejected", async () => {
  const h = harness();
  const d = decision();
  d.access = { ...d.access, tenantId: "t2" };
  await assert.rejects(() => run(h.s, d), (e) => e.code === "tenant_mismatch");
});

test("invalid session handoff is rejected", async () => {
  const h = harness();
  const d = decision();
  d.session = { ...d.session, nextStage: "other" };
  await assert.rejects(() => run(h.s, d), (e) => e.code === "invalid_session_handoff");
});

test("production-validated issuance policy is rejected", async () => {
  const h = harness({ policy: async () => ({ allowed: true, policyId: "p", policyDigest: D("c"), productionValidated: true }) });
  await assert.rejects(() => run(h.s), (e) => e.code === "production_not_authorized");
});

test("persistence failure never persists raw secret", async () => {
  let record;
  const h = harness({ persistSession: async (r) => { record = r; return false; } });
  await assert.rejects(() => run(h.s), (e) => e.code === "session_persistence_failed");
  assert.equal(record.sessionSecret, undefined);
});
