import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustFaceLabHttpHandler } from "../src/global-trust-face-lab-http.mjs";

const TOKEN = "trust_session_abcdefghijklmnopqrstuvwxyz.0123456789";
const SESSION = { sessionId:"s", organizationId:"o", enrollmentId:"e", scopes:["trust:evaluation:portal"] };
const LIVE_ENV = {
  TRUST_AWS_LIVE_CALLS_ENABLED:"true",
  TRUST_AWS_CREDENTIALS_ALLOWED:"true",
  TRUST_AWS_SANDBOX_APPROVAL:"IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
};

function handler(liveRuntime, env = {}) {
  return createGlobalTrustFaceLabHttpHandler({
    liveRuntime,
    env,
    portalSession: { async authenticate({token}) {
      if (token !== TOKEN) { const e = new Error("unauthorized"); e.code="TRUST_EVALUATION_PORTAL_SESSION_UNAUTHORIZED"; throw e; }
      return SESSION;
    }},
  });
}
function req(url, body) {
  return { method:"POST", url, headers:{authorization:`Bearer ${TOKEN}`}, body:JSON.stringify(body) };
}
function body(r){ return JSON.parse(r.body); }

test("live liveness stays fail-closed without explicit gates", async () => {
  let calls = 0;
  const h = handler({ async createLivenessSession(){ calls++; return {}; } });
  const r = await h.handleRequest(req("/v1/trust/evaluation/portal/face-lab/liveness/session", {
    clientRequestToken:"token-1",
    outputConfig:{S3Bucket:"trust-sandbox",S3KeyPrefix:"trust-face-lab/sandbox/s1"},
  }));
  assert.equal(r.status,503);
  assert.equal(body(r).reason,"face_lab_live_not_available");
  assert.equal(calls,0);
});

test("live liveness delegates to injected runtime when all gates are explicit", async () => {
  const calls = [];
  const h = handler({ async createLivenessSession(input){ calls.push(input); return {SessionId:"sid",auditImagesLimit:0}; } }, LIVE_ENV);
  const r = await h.handleRequest(req("/v1/trust/evaluation/portal/face-lab/liveness/session", {
    clientRequestToken:"token-1",
    outputConfig:{S3Bucket:"trust-sandbox",S3KeyPrefix:"trust-face-lab/sandbox/s1"},
  }));
  assert.equal(r.status,201);
  assert.equal(calls.length,1);
  assert.equal(body(r).result.auditImagesLimit,0);
});

test("live compare keeps provider signal separate and rejects raw bytes", async () => {
  let calls = 0;
  const h = handler({ async compareFaces(){ calls++; return {Similarity:93.25,MatchCount:1,TargetFaceCount:1}; } }, LIVE_ENV);
  const good = await h.handleRequest(req("/v1/trust/evaluation/portal/face-lab/compare", {
    sourceS3Object:{Bucket:"trust-sandbox",Name:"trust-face-lab/sandbox/source.jpg"},
    targetS3Object:{Bucket:"trust-sandbox",Name:"trust-face-lab/sandbox/target.jpg"},
  }));
  assert.equal(good.status,200);
  assert.equal(body(good).providerSignal.Similarity,93.25);
  assert.equal(body(good).trustDecision,null);

  const bad = await h.handleRequest(req("/v1/trust/evaluation/portal/face-lab/compare", {
    sourceS3Object:{Bucket:"trust-sandbox",Name:"source.jpg",Bytes:"forbidden"},
    targetS3Object:{Bucket:"trust-sandbox",Name:"target.jpg"},
  }));
  assert.equal(bad.status,400);
  assert.equal(body(bad).reason,"raw_biometric_material_forbidden");
  assert.equal(calls,1);
});
