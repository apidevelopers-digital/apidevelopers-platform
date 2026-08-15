import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTrustEvaluationPortalEnabled,
  startOperationalGateway,
} from "../src/operational-server.mjs";

function fakeServer({ host = "127.0.0.1", port = 3110 } = {}) {
  return {
    address() {
      return { address: host, port };
    },
    close(callback) {
      callback?.();
    },
  };
}

test("Trust Evaluation Portal flag is disabled by default and accepts only explicit true", () => {
  assert.equal(resolveTrustEvaluationPortalEnabled({}), false);
  assert.equal(
    resolveTrustEvaluationPortalEnabled({
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "",
    }),
    false,
  );
  assert.equal(
    resolveTrustEvaluationPortalEnabled({
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "false",
    }),
    false,
  );
  assert.equal(
    resolveTrustEvaluationPortalEnabled({
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "TRUE",
    }),
    true,
  );
  assert.throws(
    () =>
      resolveTrustEvaluationPortalEnabled({
        GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "yes",
      }),
    /GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED/,
  );
});

test("portal cannot be enabled while Trust Evaluation is disabled", async () => {
  let evaluationLoaderCalls = 0;
  let portalLoaderCalls = 0;
  let runtimeCalls = 0;
  let serverCalls = 0;

  await assert.rejects(
    startOperationalGateway({
      env: {
        GLOBAL_TRUST_EVALUATION_ENABLED: "false",
        GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "true",
      },
      logger: { log() {} },
      runtimeFactory() {
        runtimeCalls += 1;
        throw new Error("runtime must not start");
      },
      async serverFactory() {
        serverCalls += 1;
        throw new Error("server must not bind");
      },
      async trustEvaluationLoader() {
        evaluationLoaderCalls += 1;
        return {};
      },
      async trustEvaluationPortalLoader() {
        portalLoaderCalls += 1;
        return {};
      },
    }),
    (error) =>
      error instanceof TypeError &&
      error.message.includes(
        "GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED requires GLOBAL_TRUST_EVALUATION_ENABLED=true",
      ),
  );

  assert.equal(evaluationLoaderCalls, 0);
  assert.equal(portalLoaderCalls, 0);
  assert.equal(runtimeCalls, 0);
  assert.equal(serverCalls, 0);
});

test("portal-enabled runtime composes Evaluation first and in-product portal second before bind", async () => {
  const calls = [];
  const logs = [];
  const baseApp = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{\"base\":true}" };
    },
  });
  const evaluationApp = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{\"evaluation\":true}" };
    },
  });
  const portalApp = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{\"portal\":true}" };
    },
  });
  const baseGateway = Object.freeze({
    marker: "base",
    app: baseApp,
  });

  const result = await startOperationalGateway({
    env: {
      GLOBAL_TRUST_EVALUATION_ENABLED: "true",
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "true",
    },
    logger: {
      log(value) {
        logs.push(JSON.parse(value));
      },
    },
    runtimeFactory(options) {
      calls.push("runtime");
      assert.equal(typeof options.gatewayTransform, "function");
      const gateway = options.gatewayTransform({ gateway: baseGateway });
      assert.equal(gateway.marker, "portal");
      assert.equal(gateway.app, portalApp);
      return Object.freeze({
        host: "127.0.0.1",
        port: 3110,
        app: gateway.app,
        descriptor: Object.freeze({ mode: "operational" }),
      });
    },
    async serverFactory({ app, host, port }) {
      calls.push("server");
      assert.equal(app, portalApp);
      return fakeServer({ host, port });
    },
    async trustEvaluationLoader() {
      calls.push("load-evaluation");
      return {
        attachOperationalTrustEvaluationGateway({ gateway }) {
          calls.push("attach-evaluation");
          assert.equal(gateway, baseGateway);
          return Object.freeze({
            ...gateway,
            marker: "evaluation",
            app: evaluationApp,
          });
        },
      };
    },
    async trustEvaluationPortalLoader() {
      calls.push("load-portal");
      return {
        attachOperationalTrustEvaluationPortal({ gateway }) {
          calls.push("attach-portal");
          assert.equal(gateway.marker, "evaluation");
          assert.equal(gateway.app, evaluationApp);
          return Object.freeze({
            ...gateway,
            marker: "portal",
            evaluationDeliveryChannel: "in_product_portal",
            evaluationExternalEnvelopeEgress: false,
            app: portalApp,
          });
        },
      };
    },
  });

  assert.equal(result.runtime.app, portalApp);
  assert.deepEqual(calls, [
    "load-evaluation",
    "load-portal",
    "runtime",
    "attach-evaluation",
    "attach-portal",
    "server",
  ]);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].trustEvaluation.enabled, true);
  assert.equal(logs[0].trustEvaluation.environment, "sandbox");
  assert.equal(logs[0].trustEvaluation.financialEgress, "blocked");
  assert.equal(logs[0].trustEvaluation.realMoney, false);
  assert.deepEqual(logs[0].trustEvaluation.portal, {
    enabled: true,
    deliveryChannel: "in_product_portal",
    externalEnvelopeEgress: false,
  });
});

test("Evaluation without portal preserves the existing runtime attachment and never loads portal code", async () => {
  let portalLoaderCalls = 0;
  let evaluationAttachCalls = 0;
  const baseGateway = Object.freeze({
    app: Object.freeze({
      async handleRequest() {
        return { status: 200, headers: {}, body: "{}" };
      },
    }),
  });
  const evaluationGateway = Object.freeze({
    ...baseGateway,
    marker: "evaluation-only",
  });

  await startOperationalGateway({
    env: {
      GLOBAL_TRUST_EVALUATION_ENABLED: "true",
      GLOBAL_TRUST_EVALUATION_PORTAL_ENABLED: "false",
    },
    logger: { log() {} },
    runtimeFactory(options) {
      const gateway = options.gatewayTransform({ gateway: baseGateway });
      assert.equal(gateway, evaluationGateway);
      return Object.freeze({
        host: "127.0.0.1",
        port: 3111,
        app: gateway.app,
        descriptor: Object.freeze({ mode: "operational" }),
      });
    },
    async serverFactory({ host, port }) {
      return fakeServer({ host, port });
    },
    async trustEvaluationLoader() {
      return {
        attachOperationalTrustEvaluationGateway({ gateway }) {
          evaluationAttachCalls += 1;
          assert.equal(gateway, baseGateway);
          return evaluationGateway;
        },
      };
    },
    async trustEvaluationPortalLoader() {
      portalLoaderCalls += 1;
      throw new Error("portal loader must stay unused");
    },
  });

  assert.equal(evaluationAttachCalls, 1);
  assert.equal(portalLoaderCalls, 0);
});
