import assert from "node:assert/strict";
import test from "node:test";

import {
  createGlobalTrustEvaluationHttpHandler,
  TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
} from "../src/global-trust-evaluation-http.mjs";

function adminIdentity() {
  return {
    role: "admin",
    principal: {
      id: "igor",
      name: "Igor",
      status: "active",
      scopes: ["admin:*"],
    },
  };
}

function createHandler(enrollment) {
  const identity = adminIdentity();
  let calls = 0;
  return {
    api: createGlobalTrustEvaluationHttpHandler({
      authenticator: { async authenticate() { return identity; } },
      evaluationTenantService: { async assertEvaluationActive() { throw new Error("not_expected"); } },
      recipientKeyEnrollmentService: {
        async getApprovedEnrollment({ identity: caller, organizationId }) {
          calls += 1;
          assert.equal(caller, identity);
          assert.equal(organizationId, "component.organization.apidevelopers-digital");
          return enrollment;
        },
      },
    }),
    calls: () => calls,
  };
}

test("Trust Preview institutional organization id is deterministic", () => {
  assert.equal(
    TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
    "component.organization.apidevelopers-digital",
  );
});

test("operator readiness returns missing enrollment without inventing one", async () => {
  const fx = createHandler(null);
  const response = await fx.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/operator/institutional-enrollment",
  });
  assert.equal(response.status, 200);
  assert.equal(fx.calls(), 1);
  assert.deepEqual(JSON.parse(response.body), {
    allowed: true,
    institution: {
      displayName: "API Developers.digital",
      githubOrganization: "apidevelopers-digital",
      organizationId: "component.organization.apidevelopers-digital",
    },
    enrollment: {
      organizationId: "component.organization.apidevelopers-digital",
      enrollmentPresent: false,
      status: "missing",
      keyPossessionVerified: false,
      identityVerifiedByThisService: false,
    },
    secretsIncluded: false,
    privateKeyIncluded: false,
  });
});

test("operator readiness exposes only sanitized approved enrollment evidence", async () => {
  const fx = createHandler({
    enrollmentId: "enrollment-1",
    status: "approved",
    organizationId: "component.organization.apidevelopers-digital",
    recipientKeyFingerprint: "fingerprint-public",
    recipientPublicKeySpkiPem: "must-not-leak",
    keyPossessionVerified: true,
    identityVerifiedByThisService: false,
    approvalReference: "approval-1",
    approvedBy: "igor",
    approvedAt: "2026-08-27T15:00:00.000Z",
    recordedBy: { id: "igor", name: "Igor" },
    recordedAt: "2026-08-27T15:01:00.000Z",
  });
  const response = await fx.api.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/operator/institutional-enrollment",
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.enrollment.enrollmentPresent, true);
  assert.equal(body.enrollment.recipientKeyFingerprint, "fingerprint-public");
  assert.equal(body.enrollment.keyPossessionVerified, true);
  assert.equal(body.secretsIncluded, false);
  assert.equal(body.privateKeyIncluded, false);
  assert.equal(JSON.stringify(body).includes("must-not-leak"), false);
});
