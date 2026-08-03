import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

const configuredEnv = Object.freeze({
  API_GATEWAY_STATE_FILE: "state.json",
  OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
  OPERATOR_GITHUB_CREDENTIAL_REF:
    "vault://github/operator-readonly-installation-token",
});

function gatewayCapture(capture) {
  return (options) => {
    capture.options = options;
    return {
      app: { async handleRequest() {} },
      readiness: {},
      store: {},
    };
  };
}

test("runtime composes a resolver-backed provider for configured GitHub", async () => {
  const token = `ghs_${"A".repeat(516)}`;
  const capture = {};
  const resolverCalls = [];

  const runtime = createOperationalRuntime({
    cwd: "/tmp/wave6",
    env: configuredEnv,
    gatewayFactory: gatewayCapture(capture),
    githubSecretResolver(access, context) {
      resolverCalls.push({ access, signal: context.signal });
      return {
        bytes: Buffer.from(token, "utf8"),
        version: "stateless-v1",
        expiresAt: "2099-01-01T00:00:00.000Z",
      };
    },
    githubTransport: {
      async requestWithCredential(input) {
        assert.equal(input.credential.bytes.byteLength, 520);
        assert.equal(
          Buffer.from(input.credential.bytes).toString("utf8"),
          token,
        );
        assert.equal(input.request.method, "GET");
        return {
          status: 200,
          headers: {},
          body: { login: "apidevelopers-digital" },
        };
      },
    },
  });

  const result =
    await capture.options.githubReadonlyClient.getOrganization({
      organization: "apidevelopers-digital",
      correlationId: "corr_wave6_001",
      tenantId: "uni.operator",
    });

  assert.deepEqual(result, { login: "apidevelopers-digital" });
  assert.equal(resolverCalls.length, 1);
  assert.deepEqual(resolverCalls[0].access, {
    secretRef: "vault://github/operator-readonly-installation-token",
    purpose: "github.readonly.organization.get",
    correlationId: "corr_wave6_001",
    tenantId: "uni.operator",
  });
  assert.equal(resolverCalls[0].signal instanceof AbortSignal, true);
  assert.equal(runtime.descriptor.githubReadonly.configured, true);
  assert.equal(
    runtime.descriptor.githubReadonly.tokenMaterialLoadedDuringComposition,
    false,
  );
  assert.equal(JSON.stringify(runtime.descriptor).includes(token), false);
  assert.equal(
    JSON.stringify(runtime.descriptor).includes(
      configuredEnv.OPERATOR_GITHUB_CREDENTIAL_REF,
    ),
    false,
  );
});

test("an explicitly injected provider keeps precedence over resolver composition", () => {
  const explicitProvider = Object.freeze({
    async withSecret(_access, consumer) {
      return consumer({ bytes: Buffer.from("ghs_test", "utf8") });
    },
  });
  let providerFactoryCalls = 0;
  let runtimeInput;

  createOperationalRuntime({
    cwd: "/tmp/wave6-explicit",
    env: configuredEnv,
    githubSecretProvider: explicitProvider,
    githubSecretResolver() {
      throw new Error("resolver must not run");
    },
    githubSecretProviderFactory() {
      providerFactoryCalls += 1;
      throw new Error("provider factory must not run");
    },
    githubTransport: { async requestWithCredential() {} },
    githubRuntimeFactory(input) {
      runtimeInput = input;
      return {
        configured: false,
        descriptor: { configured: false, productionChanged: false },
      };
    },
    gatewayFactory: gatewayCapture({}),
  });

  assert.equal(providerFactoryCalls, 0);
  assert.equal(runtimeInput.secretProvider, explicitProvider);
});

test("unconfigured GitHub creates neither provider nor transport", () => {
  let providerFactoryCalls = 0;
  let transportFactoryCalls = 0;
  let runtimeInput;

  createOperationalRuntime({
    cwd: "/tmp/wave6-unconfigured",
    env: { API_GATEWAY_STATE_FILE: "state.json" },
    githubSecretResolver() {
      throw new Error("resolver must not run");
    },
    githubSecretProviderFactory() {
      providerFactoryCalls += 1;
    },
    githubTransportFactory() {
      transportFactoryCalls += 1;
    },
    githubRuntimeFactory(input) {
      runtimeInput = input;
      return {
        configured: false,
        descriptor: {
          configured: false,
          mode: "deny-by-default",
          productionChanged: false,
        },
      };
    },
    gatewayFactory: gatewayCapture({}),
  });

  assert.equal(providerFactoryCalls, 0);
  assert.equal(transportFactoryCalls, 0);
  assert.equal(runtimeInput.secretProvider, undefined);
  assert.equal(runtimeInput.transport, undefined);
});

test("configured GitHub without provider or resolver fails closed", () => {
  assert.throws(
    () =>
      createOperationalRuntime({
        cwd: "/tmp/wave6-fail",
        env: configuredEnv,
        githubTransport: { async requestWithCredential() {} },
      }),
    /secretProvider\.withSecret must be a function/,
  );
});
