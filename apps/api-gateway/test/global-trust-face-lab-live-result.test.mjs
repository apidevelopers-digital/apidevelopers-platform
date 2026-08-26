import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustFaceLabHttpHandler } from "../src/global-trust-face-lab-http.mjs";

const TOKEN = "trust_session_abcdefghijklmnopqrstuvwxyz.0123456789";
const LIVE_ENV = {
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
};

function createHandler(liveRuntime, env = LIVE_ENV) {
  return createGlobalTrustFaceLabHttpHandler({
    liveRuntime,
    env,
    portalSession: {
      async authenticate({ token }) {
        if (token !== TOKEN) {
          const error = new Error("unauthorized");
          error.code = "TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED";
          throw error;
        }
        return {
          sessionId: "session-face-lab",
          organizationId: "org-face-lab",
          enrollmentId: "enrollment-face-lab",
          scopes: ["trust:evaluation:portal"],
        };
      },
    },
  });
}

test("live liveness result delegates by session id and returns sanitized runtime result", async () => {
  const calls = [];
  const handler = createHandler({
    async getLivenessResult(input) {
      calls.push(input);
      return Object.freeze({
        SessionId: input.sessionId,
        Status: "SUCCEEDED",
        Confidence: 98.7,
        ReferenceImage: Object.freeze({
          S3Object: Object.freeze({
            Bucket: "trust-sandbox",
            Name: "trust-face-lab/sandbox/reference.jpg",
          }),
        }),
        AuditImages: Object.freeze([]),
      });
    },
  });

  const response = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/face-lab/liveness/result",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sessionId: "12345678-1bcd-4abc-8def-123456789abc" }),
  });

  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ sessionId: "12345678-1bcd-4abc-8def-123456789abc" }]);

  const payload = JSON.parse(response.body);
  assert.equal(payload.allowed, true);
  assert.equal(payload.operation, "face-liveness-result");
  assert.equal(payload.result.Status, "SUCCEEDED");
  assert.equal(payload.result.Confidence, 98.7);
  assert.deepEqual(payload.result.AuditImages, []);
});

test("live liveness result stays fail-closed when runtime gates are absent", async () => {
  let calls = 0;
  const handler = createHandler({
    async getLivenessResult() {
      calls += 1;
      return {};
    },
  }, {});

  const response = await handler.handleRequest({
    method: "POST",
    url: "/v1/trust/evaluation/portal/face-lab/liveness/result",
    headers: { authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ sessionId: "12345678-1bcd-4abc-8def-123456789abc" }),
  });

  assert.equal(response.status, 503);
  assert.equal(JSON.parse(response.body).reason, "face_lab_live_not_available");
  assert.equal(calls, 0);
});
