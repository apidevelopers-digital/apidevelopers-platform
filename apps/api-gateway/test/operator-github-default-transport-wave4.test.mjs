import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

function gatewayFactoryCapture(capture) {
  return (options) => {
    capture.options = options;
    return {
      app: { async handleRequest() {} },
      readiness: Object.freeze({}),
      store: Object.freeze({}),
    };
  };
}

function secretProvider(bytes = Buffer.from("ghs_test", "utf8")) {
  return {
    async withSecret(_access, consumer) {
      return consumer({
        bytes,
        version: "synthetic-wave4",
      });
    },
  };
}

test("default GitHub transport is not created when GitHub runtime is unconfigured", () => {
  let transportFactoryCalls = 0;
  let runtimeInput;
  const capture = {};

  const runtime = createOperationalRuntime({
    cwd: "/tmp/operator-wave4-unconfigured",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
    },
    githubTransportFactory() {
      transportFactoryCalls += 1;
      return { requestWithCredential() {} };
    },
    githubRuntimeFactory(input) {
      runtimeInput = input;
      return {
        configured: false,
        descriptor: Object.freeze({
          configured: false,
          mode: "deny-by-default",
          reason: "github_readonly_not_configured",
          productionChanged: false,
        }),
      };
    },
    gatewayFactory: gatewayFactoryCapture(capture),
  });

  assert.equal(transportFactoryCalls, 0);
  assert.equal(runtimeInput.transport, undefined);
  assert.equal(Object.hasOwn(capture.options, "githubReadonlyClient"), false);
  assert.equal(runtime.descriptor.githubReadonly.mode, "deny-by-default");
});

test("complete GitHub configuration composes the bounded transport automatically", () => {
  let transportFactoryCalls = 0;
  const capture = {};
  const transport = Object.freeze({
    async requestWithCredential() {
      return {
        status: 200,
        headers: {},
        body: JSON.stringify({ login: "apidevelopers-digital" }),
      };
    },
  });

  const runtime = createOperationalRuntime({
    cwd: "/tmp/operator-wave4-configured",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
      OPERATOR_GITHUB_CREDENTIAL_REF:
        "vault://github/operator-readonly-installation-token",
    },
    githubSecretProvider: secretProvider(
      Buffer.from(`ghs_${"A".repeat(516)}`, "utf8"),
    ),
    githubTransportFactory() {
      transportFactoryCalls += 1;
      return transport;
    },
    gatewayFactory: gatewayFactoryCapture(capture),
  });

  assert.equal(transportFactoryCalls, 1);
  assert.equal(runtime.descriptor.githubReadonly.configured, true);
  assert.equal(runtime.descriptor.githubReadonly.productionChanged, false);
  assert.equal(
    runtime.descriptor.githubReadonly.tokenMaterialLoadedDuringComposition,
    false,
  );
  assert.equal(
    runtime.descriptor.githubReadonly.credentialReferenceConfigured,
    true,
  );
  assert.equal(capture.options.githubReadonlyOrganization, "apidevelopers-digital");
  assert.equal(
    typeof capture.options.githubReadonlyClient.getOrganization,
    "function",
  );
  assert.equal(
    JSON.stringify(runtime.descriptor).includes(
      "vault://github/operator-readonly-installation-token",
    ),
    false,
  );
});

test("explicit GitHub transport overrides the default factory", () => {
  let transportFactoryCalls = 0;
  let runtimeTransport;
  const capture = {};
  const explicitTransport = Object.freeze({
    async requestWithCredential() {
      return { status: 200, headers: {}, body: "{}" };
    },
  });

  createOperationalRuntime({
    cwd: "/tmp/operator-wave4-override",
    env: {
      API_GATEWAY_STATE_FILE: "state.json",
      OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
      OPERATOR_GITHUB_CREDENTIAL_REF:
        "secret://github/operator-readonly-installation-token",
    },
    githubTransport: explicitTransport,
    githubTransportFactory() {
      transportFactoryCalls += 1;
      throw new Error("default factory must not run");
    },
    githubRuntimeFactory(input) {
      runtimeTransport = input.transport;
      return {
        configured: false,
        descriptor: Object.freeze({
          configured: false,
          mode: "test",
          productionChanged: false,
        }),
      };
    },
    gatewayFactory: gatewayFactoryCapture(capture),
  });

  assert.equal(transportFactoryCalls, 0);
  assert.equal(runtimeTransport, explicitTransport);
});
