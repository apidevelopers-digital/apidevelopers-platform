import assert from "node:assert/strict";
import test from "node:test";

import { createGlobalTrustEvaluationHttpHandler } from "../src/global-trust-evaluation-http.mjs";

const SAFE_EVALUATION = Object.freeze({
  tenantId: "component.tenant.acme-demo",
  workspaceId: "component.workspace.acme-demo.evaluation",
  productId: "trust",
  planId: "evaluation",
  displayName: "ACME Demo",
  status: "active",
  environment: "sandbox",
  createdAt: "2026-08-14T05:00:00.000Z",
  expiresAt: "2026-08-28T05:00:00.000Z",
  capabilities: ["trust-evaluate","trust-audit-read","trust-evidence-read"],
  scopes: ["trust:evaluate","trust:audit:read","trust:evidence:read"],
  limits: { requestsPerMinute: 60, maxAmountMinor: 100000 },
  controls: {
    financialEgress: "blocked",
    realMoney: false,
    biometricMaterialAccepted: false,
  },
  apiKeyId: "must-not-leak",
  apiKeyPrefix: "must-not-leak",
});

function identity(scopes = ["trust:evaluate"]) {
  return {
    role: "api_key",
    principal: {
      id: "key-1",
      tenantId: SAFE_EVALUATION.tenantId,
      scopes,
      hash: "must-not-leak",
    },
  };
}

function handler({
  authenticatedIdentity = identity(),
  evaluation = SAFE_EVALUATION,
  error = null,
} = {}) {
  let calls = 0;
  return {
    api: createGlobalTrustEvaluationHttpHandler({
      authenticator: {
        async authenticate() {
          return authenticatedIdentity;
        },
      },
      evaluationTenantService: {
        async assertEvaluationActive(tenantId) {
          calls += 1;
          assert.equal(tenantId, SAFE_EVALUATION.tenantId);
          if (error) throw error;
          return evaluation;
        },
      },
    }),
    calls: () => calls,
  };
}

test("GET evaluation returns only safe tenant-scoped sandbox context", async () => {
  const fx = handler();
  const response = await fx.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
    headers: { "x-tenant-id": SAFE_EVALUATION.tenantId },
  });

  assert.equal(response.status, 200);
  assert.equal(fx.calls(), 1);
  const body = JSON.parse(response.body);
  assert.equal(body.allowed, true);
  assert.equal(body.evaluation.tenantId, SAFE_EVALUATION.tenantId);
  assert.equal(body.evaluation.environment, "sandbox");
  assert.equal(body.evaluation.controls.financialEgress, "blocked");
  assert.equal(body.evaluation.controls.realMoney, false);
  assert.equal(body.evaluation.controls.biometricMaterialAccepted, false);
  assert.equal("secret" in body.evaluation, false);
  assert.equal("hash" in body.evaluation, false);
  assert.equal("apiKeyId" in body.evaluation, false);
  assert.equal("apiKeyPrefix" in body.evaluation, false);
});

test("GET evaluation rejects unauthenticated and under-scoped callers before service access", async () => {
  const unauth = handler({ authenticatedIdentity: null });
  const unauthResponse = await unauth.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
  });
  assert.equal(unauthResponse.status, 401);
  assert.equal(unauth.calls(), 0);

  const underScoped = handler({ authenticatedIdentity: identity(["trust:audit:read"]) });
  const scopedResponse = await underScoped.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
  });
  assert.equal(scopedResponse.status, 403);
  assert.deepEqual(JSON.parse(scopedResponse.body), {
    allowed: false,
    reason: "scope_required",
    requiredScope: "trust:evaluate",
  });
  assert.equal(underScoped.calls(), 0);
});

test("GET evaluation maps expiry fail-closed and rejects unsafe sandbox boundary", async () => {
  const expiredError = new Error("expired");
  expiredError.code = "TRUST_EVALUATION_EXPIRED";
  const expired = handler({ error: expiredError });
  const expiredResponse = await expired.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
  });
  assert.equal(expiredResponse.status, 410);
  assert.equal(JSON.parse(expiredResponse.body).reason, "evaluation_expired");

  const unsafe = handler({
    evaluation: {
      ...SAFE_EVALUATION,
      controls: { ...SAFE_EVALUATION.controls, realMoney: true },
    },
  });
  const unsafeResponse = await unsafe.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation",
  });
  assert.equal(unsafeResponse.status, 503);
  assert.equal(JSON.parse(unsafeResponse.body).reason, "evaluation_boundary_invalid");
});

test("evaluation handler ignores unrelated routes", async () => {
  const fx = handler();
  assert.equal(
    await fx.api.handleRequest({ method: "GET", url: "/v1/whoami" }),
    null,
  );
  assert.equal(fx.calls(), 0);
});
