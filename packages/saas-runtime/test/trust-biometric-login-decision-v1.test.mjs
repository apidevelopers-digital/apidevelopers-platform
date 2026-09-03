import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createAccessRuntime } from "../src/access.mjs";

import {
  TRUST_BIOMETRIC_LOGIN_DECISION_V1,
  createTrustBiometricLoginDecision,
} from "../src/trust-biometric-login-decision-v1.mjs";

const D = (c) => `sha256:${c.repeat(64)}`;

function biometricResult(overrides = {}) {
  return {
    contractVersion: "trust-biometric-adapter/v1",
    providerId: "trust-face-sandbox",
    adapterMode: "sandbox-conformance",
    status: "completed",
    modality: "face",
    livenessPerformed: true,
    providerReference: "provider-ref-001",
    signals: {
      faceMatchScore: 0.93,
      livenessScore: 0.91,
      livenessPassed: true,
    },
    reasonCodes: [],
    productionAuthorized: false,
    rawBiometricMaterialForwarded: false,
    rawBiometricMaterialPersisted: false,
    ...overrides,
  };
}

function request(overrides = {}) {
  return {
    environment: "sandbox",
    tenantId: "tenant-1",
    verificationId: "verification-1",
    subjectRef: "subject-1",
    providerSessionRef: "provider-session-1",
    consentRef: "consent-1",
    ...overrides,
  };
}

function harness(overrides = {}) {
  const calls = { biometric: 0, policy: 0, principal: 0, grant: 0, access: 0 };
  const biometricAdapter = {
    async verifyFaceLiveness() {
      calls.biometric += 1;
      return biometricResult();
    },
  };
  const evaluateBiometricPolicy = async ({ biometricResult: result }) => {
    calls.policy += 1;
    return {
      allowed: result.signals.faceMatchScore >= 0.8 && result.signals.livenessScore >= 0.8,
      policyId: "sandbox-face-policy-v1",
      policyDigest: D("a"),
      productionValidated: false,
      reason: null,
    };
  };
  const resolvePrincipalBySubjectRef = async () => {
    calls.principal += 1;
    return {
      id: "principal-1",
      tenantId: "tenant-1",
      status: "active",
      scopes: ["product:read"],
    };
  };
  const accessRuntime = {
    async resolveActiveGrant() {
      calls.grant += 1;
      return { resolved: true, reason: null, grant: { accessGrantId: "grant-1" } };
    },
    async evaluateAccess() {
      calls.access += 1;
      return { allowed: true, reason: null, missingScopes: [] };
    },
  };

  const flow = createTrustBiometricLoginDecision({
    biometricAdapter: overrides.biometricAdapter || biometricAdapter,
    evaluateBiometricPolicy: overrides.evaluateBiometricPolicy || evaluateBiometricPolicy,
    resolvePrincipalBySubjectRef: overrides.resolvePrincipalBySubjectRef || resolvePrincipalBySubjectRef,
    accessRuntime: overrides.accessRuntime || accessRuntime,
  });
  return { flow, calls };
}

test("profile stays sandbox-only and session issuance disabled", () => {
  assert.equal(TRUST_BIOMETRIC_LOGIN_DECISION_V1.productionEnabled, false);
  assert.equal(TRUST_BIOMETRIC_LOGIN_DECISION_V1.rawBiometricMaterialAccepted, false);
  assert.equal(TRUST_BIOMETRIC_LOGIN_DECISION_V1.sessionIssuanceEnabled, false);
  assert.equal(TRUST_BIOMETRIC_LOGIN_DECISION_V1.modality, "face");
});

test("authorized biometric decision resolves principal and SaaS access", async () => {
  const { flow, calls } = harness();
  const result = await flow.login({
    biometricRequest: request(),
    workspaceId: "workspace-1",
    productId: "product-1",
  });
  assert.equal(result.status, "authorized");
  assert.equal(result.identity.principal.id, "principal-1");
  assert.equal(result.identity.principal.authenticationMethod, "trust_biometric_face_sandbox");
  assert.equal(result.access.accessGrantId, "grant-1");
  assert.equal(result.session.issued, false);
  assert.equal(result.productionReady, false);
  assert.deepEqual(calls, { biometric: 1, policy: 1, principal: 1, grant: 1, access: 1 });
});

test("failed liveness denies before policy and SaaS resolution", async () => {
  let calls;
  const h = harness();
  calls = h.calls;
  const flow = createTrustBiometricLoginDecision({
    biometricAdapter: {
      async verifyFaceLiveness() {
        calls.biometric += 1;
        return biometricResult({
          signals: { faceMatchScore: 0.94, livenessScore: 0.25, livenessPassed: false },
        });
      },
    },
    evaluateBiometricPolicy: async () => { calls.policy += 1; return {allowed: true, policyId:"p", policyDigest:D("a"), productionValidated:false}; },
    resolvePrincipalBySubjectRef: async () => { calls.principal += 1; return null; },
    accessRuntime: {
      async resolveActiveGrant(){ calls.grant += 1; return {resolved:false, grant:null}; },
      async evaluateAccess(){ calls.access += 1; return {allowed:false}; },
    },
  });
  const result = await flow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "biometric_liveness_not_passed");
  assert.equal(result.stage, "biometric");
  assert.equal(calls.policy, 0);
  assert.equal(calls.principal, 0);
});

test("biometric policy denial stops before principal lookup", async () => {
  const { flow, calls } = harness({
    evaluateBiometricPolicy: async () => {
      calls.policy += 1;
      return {
        allowed: false,
        policyId: "sandbox-face-policy-v1",
        policyDigest: D("b"),
        productionValidated: false,
        reason: "face_match_below_sandbox_threshold",
      };
    },
  });
  const result = await flow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "face_match_below_sandbox_threshold");
  assert.equal(result.stage, "biometric_policy");
  assert.equal(calls.principal, 0);
});

test("missing principal denies before grant lookup", async () => {
  const { flow, calls } = harness({
    resolvePrincipalBySubjectRef: async () => {
      calls.principal += 1;
      return null;
    },
  });
  const result = await flow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "biometric_principal_not_resolved");
  assert.equal(result.stage, "principal");
  assert.equal(calls.grant, 0);
});

test("missing active grant denies before access evaluation", async () => {
  let calls;
  const h = harness();
  calls = h.calls;
  const flow = createTrustBiometricLoginDecision({
    biometricAdapter: { async verifyFaceLiveness(){ calls.biometric += 1; return biometricResult(); } },
    evaluateBiometricPolicy: async () => { calls.policy += 1; return {allowed:true, policyId:"p", policyDigest:D("a"), productionValidated:false}; },
    resolvePrincipalBySubjectRef: async () => { calls.principal += 1; return {id:"principal-1", tenantId:"tenant-1", status:"active", scopes:["product:read"]}; },
    accessRuntime: {
      async resolveActiveGrant(){ calls.grant += 1; return {resolved:false, reason:"access_grant_not_found", grant:null}; },
      async evaluateAccess(){ calls.access += 1; return {allowed:true}; },
    },
  });
  const result = await flow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "access_grant_not_found");
  assert.equal(result.stage, "grant");
  assert.equal(calls.access, 0);
});

test("SaaS scope/access denial is propagated fail-closed", async () => {
  const { flow } = harness({
    accessRuntime: {
      async resolveActiveGrant() {
        return { resolved: true, grant: { accessGrantId: "grant-1" } };
      },
      async evaluateAccess() {
        return { allowed: false, reason: "scope_forbidden", missingScopes: ["product:read"] };
      },
    },
  });
  const result = await flow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" });
  assert.equal(result.status, "denied");
  assert.equal(result.reason, "scope_forbidden");
  assert.equal(result.stage, "access");
});

test("raw biometric fields are rejected before adapter invocation", async () => {
  const { flow, calls } = harness();
  await assert.rejects(
    () => flow.login({ biometricRequest: request({ rawImage: "forbidden" }), workspaceId: "w", productId: "p" }),
    (error) => error.cod === "raw_biometric_material_forbidden",
  );
  assert.equal(calls.biometric, 0);
});

test("production request and production-validated policy are blocked", async () => {
  const { flow } = harness();
  await assert.rejects(
    () => flow.login({ biometricRequest: request({ environment: "production" }), workspaceId: "w", productId: "p" }),
    (error) => error.code === "production_not_authorized",
  );

  const { flow: policyFlow } = harness({
    evaluateBiometricPolicy: async () => ({
      allowed: true,
      policyId: "prod-looking-policy",
      policyDigest: D("c"),
      productionValidated: true,
    }),
  });
  await assert.rejects(
    () => policyFlow.login({ biometricRequest: request(), workspaceId: "w", productId: "p" }),
    (error) => error.code === "production_policy_not_authorized",
  );
});


test("authorized biometric decision integrates with the real SaaS access runtime", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-biometric-login-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => "2026-09-02T20:00:00.000Z",
  });
  const accessRuntime = createAccessRuntime({
    store,
    saasRuntime: {},
    clock: () => "2026-09-02T20:00:00.000Z",
  });

  try {
    await accessRuntime.grantAccess({{
      accessGrantId: "component.access.tenant-1.workspace-1.product-1.principal-1",
      principalId: "principal-1",
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      productId: "product-1",
      subscriptionId: "subscription-1",
      entitlementId: "entitlement-1",
      requiredScopes: ["product:read"],
      status: "active",
      createdAt: "2026-09-02T20:00:00.000Z",
      activatedAt: "2026-09-02T20:00:00.000Z",
    });

    const flow = createTrustBiometricLoginDecision({
      biometricAdapter: {
        async verifyFaceLiveness() {
          return biometricResult();
        },
      },
      evaluateBiometricPolicy: async () => ({
        allowed: true,
        policyId: "sandbox-face-policy-v1",
        policyDigest: D("a"),
        productionValidated: false,
        reason: null,
      }),
      resolvePrincipalBySubjectRef: async () => ({
        id: "principal-1",
        tenantId: "tenant-1",
        status: "active",
        scopes: ["product:read"],
      }),
      accessRuntime,
    });

    const result = await flow.login({
      biometricRequest: request(),
      workspaceId: "workspace-1",
      productId: "product-1",
    });

    assert.equal(result.status, "authorized");
    assert.equal(result.access.allowed, true);
    assert.equal(result.access.accessGrantId, "component.access.tenant-1.workspace-1.product-1.principal-1");
    assert.equal(result.identity.principal.authenticationMethod, "trust_biometric_face_sandbox");
    assert.equal(result.session.issued, false);
    assert.equal(result.productionReady, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
