import assert from "node:assert/strict";
import test from "node:test";

import {
  TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
  createTrustInstitutionalEnrollmentHttpHandler,
} from "../src/global-trust-institutional-enrollment-http.mjs";

const ADMIN = Object.freeze({
  role: "admin",
  principal: Object.freeze({
    id: "igor",
    name: "Igor",
    status: "active",
    scopes: Object.freeze(["admin:*"]),
  }),
});

function fixture() {
  const calls = [];
  return {
    calls,
    handler: createTrustInstitutionalEnrollmentHttpHandler({
      authenticator: {
        async authenticate() {
          return ADMIN;
        },
      },
      recipientKeyProofService: {
        async issueChallenge(input) {
          calls.push(["challenge", input]);
          return Object.freeze({
            challengeId: "challenge-1",
            signingPayloadB64u: "cGF5bG9hZA",
          });
        },
        async verifyAndConsume(input) {
          calls.push(["proof", input]);
          return Object.freeze({
            challengeId: input.challengeId,
            keyPossessionVerified: true,
            identityVerified: false,
          });
        },
      },
      recipientKeyEnrollmentService: {
        async recordApprovedEnrollment(input) {
          calls.push(["enrollment", input]);
          return Object.freeze({
            created: true,
            enrollmentId: "enrollment-1",
            status: "approved",
            organizationId: input.organizationId,
            recipientKeyFingerprint: "fingerprint-1",
            keyPossessionVerified: true,
          });
        },
      },
    }),
  };
}

test("institutional Trust organization id is canonical", () => {
  assert.equal(
    TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
    "component.organization.apidevelopers-digital",
  );
});

test("challenge is always bound to the canonical institutional organization", async () => {
  const fx = fixture();
  const response = await fx.handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/operator/institutional-enrollment/challenge",
    body: JSON.stringify({
      recipientPublicKey: "PUBLIC-KEY",
      correlationId: "corr-1",
    }),
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.organizationId, TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID);
  assert.equal(body.privateKeyIncluded, false);
  assert.equal(body.secretsIncluded, false);
  assert.deepEqual(fx.calls[0], [
    "challenge",
    {
      organizationId: TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
      recipientPublicKey: "PUBLIC-KEY",
      correlationId: "corr-1",
    },
  ]);
});

test("proof forwards the exact persisted challenge id", async () => {
  const fx = fixture();
  const response = await fx.handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/operator/institutional-enrollment/proof",
    body: JSON.stringify({
      challengeId: "challenge-1",
      recipientPublicKey: "PUBLIC-KEY",
      signatureB64u: "signature-1",
    }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(fx.calls[0], [
    "proof",
    {
      challengeId: "challenge-1",
      recipientPublicKey: "PUBLIC-KEY",
      signatureB64u: "signature-1",
    },
  ]);
});

test("enrollment records approval without accepting private-key material", async () => {
  const fx = fixture();
  const approval = Object.freeze({
    decision: "approved",
    assertion: "organization_and_recipient_authorized",
    reference: "trust-preview-face-2026-08-27",
    authority: "API Developers.digital",
    approvedBy: "igor",
    approvedAt: "2026-08-27T17:00:00.000Z",
    subjectOrganizationId: TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
  });
  const response = await fx.handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/operator/institutional-enrollment",
    body: JSON.stringify({
      recipientPublicKey: "PUBLIC-KEY",
      keyProofChallengeId: "challenge-1",
      institutionalApproval: approval,
    }),
  });
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);
  assert.equal(body.enrollment.status, "approved");
  assert.equal(body.privateKeyIncluded, false);
  assert.equal(body.secretsIncluded, false);
  assert.deepEqual(fx.calls[0], [
    "enrollment",
    {
      identity: ADMIN,
      organizationId: TRUST_PREVIEW_INSTITUTION_ORGANIZATION_ID,
      recipientPublicKey: "PUBLIC-KEY",
      keyProofChallengeId: "challenge-1",
      institutionalApproval: approval,
    },
  ]);
});

test("unrelated route is not intercepted", async () => {
  const fx = fixture();
  assert.equal(
    await fx.handler.handleRequest({ method: "GET", url: "/health" }),
    null,
  );
});
