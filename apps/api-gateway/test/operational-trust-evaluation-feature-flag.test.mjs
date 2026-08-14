import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveTrustEvaluationEnabled,
  startOperationalGateway,
} from "../src/operational-server.mjs";
import {
  attachOperationalTrustEvaluationGateway,
} from "../src/operational-trust-evaluation-composition.mjs";

function fakeServer({ host = "127.0.0.1", port = 3100 } = {}) {
  return {
    address() {
      return { address: host, port };
    },
    close(callback) {
      callback?.();
    },
  };
}

test("Trust Evaluation flag is disabled by default and false is explicit", () => {
  assert.equal(resolveTrustEvaluationEnabled({}), false);
  assert.equal(
    resolveTrustEvaluationEnabled({ GLOBAL_TRUST_EVALUATION_ENABLED: "" }),
    false,
  );
  assert.equal(
    resolveTrustEvaluationEnabled({ GLOBAL_TRUST_EVALUATION_ENABLED: "false" }),
    false,
  );
  assert.equal(
    resolveTrustEvaluationEnabled({ GLOBAL_TRUST_EVALUATION_ENABLED: "TRUE" }),
    true,
  );
});

test("invalid Trust Evaluation flag fails before runtime or server startup", async () => {
  let runtimeCalls = 0;
  let serverCalls = 0;
  let loaderCalls = 0;

  await assert.rejects(
    startOperationalGateway({
      env: { GLOBAL_TRUST_EVALUATION_ENABLED: "yes" },
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
        loaderCalls += 1;
        return {};
      },
    }),
    (error) =>
      error instanceof TypeError &&
      error.message.includes("GLOBAL_TRUST_EVALUATION_ENABLED"),
  );

  assert.equal(runtimeCalls, 0);
  assert.equal(serverCalls, 0);
  assert.equal(loaderCalls, 0);
});

test("disabled flag does not load or attach Trust Evaluation", async () => {
  let loaderCalls = 0;
  let serverCalls = 0;
  let runtimeOptions;

  const app = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{}" };
    },
  });

  const result = await startOperationalGateway({
    env: { GLOBAL_TRUST_EVALUATION_ENABLED: "false" },
    logger: { log() {} },
    runtimeFactory(options) {
      runtimeOptions = options;
      return Object.freeze({
        host: "127.0.0.1",
        port: 3100,
        app,
        descriptor: Object.freeze({ mode: "operational" }),
      });
    },
    async serverFactory({ app: servedApp, host, port }) {
      serverCalls += 1;
      assert.equal(servedApp, app);
      assert.equal(host, "127.0.0.1");
      assert.equal(port, 3100);
      return fakeServer({ host, port });
    },
    async trustEvaluationLoader() {
      loaderCalls += 1;
      throw new Error("loader must not run while flag is disabled");
    },
  });

  assert.equal(loaderCalls, 0);
  assert.equal(serverCalls, 1);
  assert.equal("gatewayTransform" in runtimeOptions, false);
  assert.equal(result.runtime.app, app);
});

test("enabled flag injects exactly one gateway transform before server bind", async () => {
  let loaderCalls = 0;
  let attachCalls = 0;
  let serverCalls = 0;
  const operatorReadonlyCore = Object.freeze({ marker: "readonly-preserved" });
  const baseApp = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{\"base\":true}" };
    },
  });
  const trustApp = Object.freeze({
    async handleRequest() {
      return { status: 200, headers: {}, body: "{\"trust\":true}" };
    },
  });
  const baseGateway = Object.freeze({
    app: baseApp,
    operatorReadonlyCore,
  });

  const result = await startOperationalGateway({
    env: { GLOBAL_TRUST_EVALUATION_ENABLED: "true" },
    logger: { log() {} },
    runtimeFactory(options) {
      assert.equal(typeof options.gatewayTransform, "function");
      const gateway = options.gatewayTransform({ gateway: baseGateway });
      assert.equal(gateway.operatorReadonlyCore, operatorReadonlyCore);
      assert.equal(gateway.app, trustApp);
      return Object.freeze({
        host: "127.0.0.1",
        port: 3101,
        app: gateway.app,
        descriptor: Object.freeze({ mode: "operational" }),
      });
    },
    async serverFactory({ app, host, port }) {
      serverCalls += 1;
      assert.equal(app, trustApp);
      return fakeServer({ host, port });
    },
    async trustEvaluationLoader() {
      loaderCalls += 1;
      return {
        attachOperationalTrustEvaluationGateway({ gateway }) {
          attachCalls += 1;
          assert.equal(gateway.operatorReadonlyCore, operatorReadonlyCore);
          return Object.freeze({ ...gateway, app: trustApp });
        },
      };
    },
  });

  assert.equal(loaderCalls, 1);
  assert.equal(attachCalls, 1);
  assert.equal(serverCalls, 1);
  assert.equal(result.runtime.app, trustApp);
});

test("real Trust Evaluation attachment preserves existing read-only operator surface", () => {
  const operatorReadonlyCore = Object.freeze({ marker: "readonly-core" });
  const operatorReadonlyAdapters = Object.freeze({ marker: "readonly-adapters" });
  const gateway = Object.freeze({
    app: Object.freeze({
      async handleRequest() {
        return { status: 404, headers: {}, body: "{}" };
      },
    }),
    store: Object.freeze({
      async read() {
        return { version: 0, data: {} };
      },
      async transaction(callback) {
        return callback({
          async get() {
            return null;
          },
          async list() {
            return [];
          },
          async create(value) {
            return value;
          },
          async replace(value) {
            return value;
          },
        });
      },
      async executeIdempotent() {
        throw new Error("not called by attachment");
      },
    }),
    apiKeyLifecycle: Object.freeze({
      async issueApiKey() {
        throw new Error("not called by attachment");
      },
      async revokeApiKey() {
        throw new Error("not called by attachment");
      },
      async listApiKeys() {
        return [];
      },
    }),
    authenticator: Object.freeze({
      async authenticate() {
        return null;
      },
    }),
    operatorReadonlyCore,
    operatorReadonlyAdapters,
  });

  const attached = attachOperationalTrustEvaluationGateway({ gateway });

  assert.equal(attached.operatorReadonlyCore, operatorReadonlyCore);
  assert.equal(attached.operatorReadonlyAdapters, operatorReadonlyAdapters);
  assert.notEqual(attached.app, gateway.app);
  assert.equal(typeof attached.evaluationTenantService?.createEvaluation, "function");
  assert.equal(typeof attached.evaluationHttp?.handleRequest, "function");
});
