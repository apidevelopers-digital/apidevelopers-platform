import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveGlobalTrustFaceLabLiveRuntime,
  shouldResolveGlobalTrustFaceLabLiveRuntime,
} from "../src/global-trust-face-lab-live-bootstrap.mjs";
import { startOperationalGateway } from "../src/operational-server.mjs";

const LIVE_ENV = Object.freeze({
  GLOBAL_TRUST_EVALUATION_ENABLED: "true",
  GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "true",
  TRUST_AWS_LIVE_CALLS_ENABLED: "true",
  TRUST_AWS_CREDENTIALS_ALLOWED: "true",
  TRUST_AWS_SANDBOX_APPROVAL: "IGOR_APROVA_TRUST_AWS_SANDBOX_REAL",
  TRUST_AWS_S3_BUCKET: "trust-sandbox",
  TRUST_AWS_S3_PREFIX: "trust-face-lab/sandbox",
  AWS_REGION: "sa-east-1",
});

function createRuntimeFactory(observePortal) {
  return ({ gatewayTransform }) => {
    const baseGateway = Object.freeze({
      app: Object.freeze({ async handleRequest() { return null; } }),
    });
    const gateway = gatewayTransform
      ? gatewayTransform({ gateway: baseGateway })
      : baseGateway;
    observePortal?.(gateway);
    return Object.freeze({
      app: gateway.app,
      host: "127.0.0.1",
      port: 0,
      descriptor: Object.freeze({ service: "api-gateway-test" }),
    });
  };
}

function createServerFactory() {
  return async () => Object.freeze({
    address() {
      return { address: "127.0.0.1", port: 4100 };
    },
    close(callback) {
      callback?.();
    },
  });
}

function createEvaluationLoader() {
  return async () => ({
    attachOperationalTrustEvaluationGateway({ gateway }) {
      return Object.freeze({ ...gateway, evaluationAttached: true });
    },
  });
}

function createPortalLoader(onAttach) {
  return async () => ({
    attachOperationalTrustEvaluationPortal(options) {
      onAttach?.(options);
      return Object.freeze({
        ...options.gateway,
        portalAttached: true,
      });
    },
  });
}

test("live bootstrap remains disabled while AWS live gates are incomplete", async () => {
  let sdkCalls = 0;
  assert.equal(shouldResolveGlobalTrustFaceLabLiveRuntime({}), false);

  const result = await resolveGlobalTrustFaceLabLiveRuntime({
    env: {},
    sdkResolver: async () => {
      sdkCalls += 1;
      throw new Error("must not resolve SDK");
    },
  });

  assert.equal(result, null);
  assert.equal(sdkCalls, 0);
});

test("operational bootstrap does not resolve Face Lab live runtime when gates are disabled", async () => {
  let resolveCalls = 0;
  let attachedOptions;

  await startOperationalGateway({
    env: {
      GLOBAL_TRUST_EVALUATION_ENABLED: "true",
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "true",
    },
    delegatedBindingSignerResolver: async () => ({ configured: false }),
    runtimeFactory: createRuntimeFactory(),
    serverFactory: createServerFactory(),
    logger: { log() {} },
    trustEvaluationLoader: createEvaluationLoader(),
    trustEvaluationPortalLoader: createPortalLoader((options) => {
      attachedOptions = options;
    }),
    trustFaceLabLiveBootstrapLoader: async () => ({
      shouldResolveGlobalTrustFaceLabLiveRuntime() {
        return false;
      },
      async resolveGlobalTrustFaceLabLiveRuntime() {
        resolveCalls += 1;
        throw new Error("must not resolve live runtime");
      },
    }),
  });

  assert.equal(resolveCalls, 0);
  assert.equal(Object.hasOwn(attachedOptions, "faceLabLiveRuntime"), false);
});

test("operational bootstrap injects the resolved Face Lab live runtime only after explicit gates", async () => {
  const liveRuntime = Object.freeze({
    async createLivenessSession() {},
    async getLivenessResult() {},
    async compareFaces() {},
  });
  let attachedOptions;

  await startOperationalGateway({
    env: LIVE_ENV,
    delegatedBindingSignerResolver: async () => ({ configured: false }),
    runtimeFactory: createRuntimeFactory(),
    serverFactory: createServerFactory(),
    logger: { log() {} },
    trustEvaluationLoader: createEvaluationLoader(),
    trustEvaluationPortalLoader: createPortalLoader((options) => {
      attachedOptions = options;
    }),
    trustFaceLabLiveBootstrapLoader: async () => ({
      shouldResolveGlobalTrustFaceLabLiveRuntime() {
        return true;
      },
      async resolveGlobalTrustFaceLabLiveRuntime({ env }) {
        assert.equal(env, LIVE_ENV);
        return liveRuntime;
      },
    }),
  });

  assert.equal(attachedOptions.faceLabLiveRuntime, liveRuntime);
  assert.equal(attachedOptions.env, LIVE_ENV);
});

test("operational bootstrap fails closed when gates are enabled but SDK/runtime resolution fails", async () => {
  await assert.rejects(
    startOperationalGateway({
      env: LIVE_ENV,
      delegatedBindingSignerResolver: async () => ({ configured: false }),
      runtimeFactory: createRuntimeFactory(),
      serverFactory: createServerFactory(),
      logger: { log() {} },
      trustEvaluationLoader: createEvaluationLoader(),
      trustEvaluationPortalLoader: createPortalLoader(),
      trustFaceLabLiveBootstrapLoader: async () => ({
        shouldResolveGlobalTrustFaceLabLiveRuntime() {
          return true;
        },
        async resolveGlobalTrustFaceLabLiveRuntime() {
          const error = new Error("SDK unavailable");
          error.code = "TRUST_FACE_LAB_AWS_SDK_UNAVAILABLE";
          throw error;
        },
      }),
    }),
    (error) => error?.code === "TRUST_FACE_LAB_AWS_SDK_UNAVAILABLE",
  );
});
