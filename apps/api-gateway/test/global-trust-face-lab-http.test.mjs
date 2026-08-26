import assert from "node:assert/strict";
import test from "node:test";

import { createGlobalTrustFaceLabHttpHandler } from "../src/global-trust-face-lab-http.mjs";

const TOKEN = "trust_session_abcdefghijklmnopqrstuvwxyz.0123456789";
const SESSION = Object.freeze({
  sessionId: "session-face-lab",
  organizationId: "org-face-lab",
  enrollmentId: "enrollment-face-lab",
  scopes: Object.freeze(["trust:evaluation:portal"]),
});

function makeHandler() {
  const calls = [];
  return {
    calls,
    handler: createGlobalTrustFaceLabHttpHandler({
      portalSession: {
        async authenticate({ token }) {
          calls.push(token);
          if (token !== TOKEN) {
            const error = new Error("unauthorized");
            error.code = "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED";
            throw error;
          }
          return SESSION;
        },
      },
    }),
  };
}

function parse(response) {
  return JSON.parse(response.body);
}

test("status is authenticated and explicitly dry-run", async () => {
  const { handler } = makeHandler();
  const response = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/face-lab/status",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(response.status, 200);
  const body = parse(response);
  assert.equal(body.allowed, true);
  assert.equal(body.faceLab.mode, "dry-run");
  assert.equal(body.faceLab.provider, "aws-rekognition");
  assert.equal(body.faceLab.region, "sa-east-1");
  assert.equal(body.faceLab.controls.liveCallsEnabled, false);
  assert.equal(body.faceLab.controls.credentialsAllowed, false);
  assert.equal(body.faceLab.controls.biometricMaterialAccepted, false);
  assert.equal(body.faceLab.controls.auditImagesLimit, 0);
});

test("liveness preview plans provider actions without live execution", async () => {
  const { handler } = makeHandler();
  const response = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/face-lab/liveness/preview",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ verificationId: "verification-001" }),
  });
  assert.equal(response.status, 200);
  const body = parse(response);
  assert.equal(body.preview.operation, "CreateFaceLivenessSession");
  assert.equal(body.preview.clientAction, "StartFaceLivenessSession");
  assert.equal(body.preview.resultAction, "GetFaceLivenessSessionResults");
  assert.equal(body.preview.sessionTtlSeconds, 180);
  assert.equal(body.preview.controls.liveCallsEnabled, false);
  assert.equal(body.preview.rawBiometricMaterialForwarded, false);
  assert.equal(body.preview.governedDecisionProduced, false);
});

test("compare preview accepts opaque refs only and keeps provider score as signal", async () => {
  const { handler } = makeHandler();
  const good = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/face-lab/compare/preview",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      verificationId: "verification-002",
      sourceReferenceRef: "ref:participant/reference-1",
      targetReferenceRef: "ref:liveness/session-1",
    }),
  });
  assert.equal(good.status, 200);
  const body = parse(good);
  assert.equal(body.preview.operation, "CompareFaces");
  assert.equal(body.preview.similarityThreshold, 0);
  assert.equal(body.preview.providerScoreIsSignalOnly, true);
  assert.equal(body.preview.governedDecisionProduced, false);

  const bad = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/face-lab/compare/preview",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({
      verificationId: "verification-003",
      sourceReferenceRef: "data:image/png;base64,AAAA",
      targetReferenceRef: "ref:liveness/session-1",
    }),
  });
  assert.equal(bad.status, 400);
  assert.equal(parse(bad).reason, "opaque_reference_required");
});

test("missing bearer is unauthorized and unrelated routes pass through", async () => {
  const { handler, calls } = makeHandler();
  const unauthorized = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/face-lab/status",
  });
  assert.equal(unauthorized.status, 401);
  assert.equal(parse(unauthorized).reason, "unauthorized");

  const unrelated = await handler.handleRequest({
    method: "GET",
    url: "/v1/trust/evaluation/portal/inbox",
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(unrelated, null);
  assert.equal(calls.length, 0);
});
