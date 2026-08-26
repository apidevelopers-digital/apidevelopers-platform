import assert from "node:assert/strict";
import test from "node:test";
import { createGlobalTrustFaceLabLiveProvider } from "../src/global-trust-face-lab-live-provider.mjs";

const LIVE_ENV = Object.freeze({
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  TRUST_AWS_S3_BUCKET: "trust-sandbox",
  TRUST_AWS_S3_PREFIX: "trust-face-lab/sandbox",
  AWS_REGION: "sa-east-1",
});

test("provider factory stays null without explicit live gates", () => {
  assert.equal(createGlobalTrustFaceLabLiveProvider({ env: {} }), null);
});

test("provider factory stays null without injected AWS client and commands", () => {
  assert.equal(createGlobalTrustFaceLabLiveProvider({ env: LIVE_ENV }), null);
});

test("provider factory materializes adapter only after gates and injected AWS primitives", () => {
  class CreateFaceLivenessSessionCommand { constructor(input){ this.input=input; } }
  class GetFaceLivenessSessionResultsCommand { constructor(input){ this.input=input; } }
  class CompareFacesCommand { constructor(input){ this.input=input; } }

  const runtime = createGlobalTrustFaceLabLiveProvider({
    env: LIVE_ENV,
    client: { async send() { throw new Error("network must not run in factory test"); } },
    commands: {
      CreateFaceLivenessSessionCommand,
      GetFaceLivenessSessionResultsCommand,
      CompareFacesCommand,
    },
  });

  assert.equal(typeof runtime.createLivenessSession, "function");
  assert.equal(typeof runtime.getLivenessResult, "function");
  assert.equal(typeof runtime.compareFaces, "function");
});
