import assert from "node:assert/strict";
import test from "node:test";

import { createOperationalRuntime } from "../src/operational-runtime.mjs";

const CONFIGURED_ENV = Object.freeze({
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
      readiness: Object.freeze({}),
      store: Object.freeze({}),
    };
  };
}

test("runtime composes exact-allowlist vault provider for configured GitHub", async () => {
  const token = `ghs_${"A".repeat(516)}`;
  const rawBytes = Buffer.from(token, "utf8");
  const capture = {};
  const accesses = [];
  let transportedBytes;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/operator-wave7",
    env: CONFIGURED_ENV,
    gatewayFactory: gatewayCapture(capture),
    githubVaultClient: {
      async withSecretLease(access, consumer) {
        accesses.push(access);
        try {
          return await consumer({
            bytes: rawBytes,
            version: "installation-v1",
            expiresAt: "2099-01-01T00:00:00.000Z",
          });
        } finally {
          rawBytes.fill(0);
        }
      },
    },
    githubTransport: {
      async requestWithCredential(input) {
        transportedBytes = input.credential.bytes;
        assert.equal(transportedBytes.byteLength, 520);
        assert.equal(Buffer.from(transportedBytes).toString("utf8"), token);
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
      correlationId: "corr_wave7_001",
      tenantId: "uni.operador",
    });

  assert.deepEqual(result, { login: "apidevelopers-digital" });
  assert.deepEqual(accesses, [
    {
      secretRef: CONFIGURED_ENV.OPERATOR_GITHUB_CREDENTIAL_REF,
      purpose: "github.readonly.organization.get",
      correlationId: "corr_wave7_001",
      tenantId: "uni.operador",
    },
  ]);
  assert.equal(runtime.descriptor.githubReadonly.configured, true);
  assert.equal(
    runtime.descriptor.githubReadonly.tokenMaterialLoadedDuringComposition,
    false,
  );
  assert.equal(
    JSON.stringify(runtime.descriptor).includes(
      CONFIGURED_ENV.OPERATOR_GITHUB_CREDENTIAL_REF,
    ),
    false,
  );
  assert.equal(JSON.stringify(runtime.descriptor).includes(token), false);
  assert.equal([...transportedBytes].every((value) => value === 0), true);
  assert.equal([...rawBytes].every((value) => value === 0), true);
});

test("explicit provider keeps precedence over vault client and resolver", () => {
  const explicitProvider = Object.freeze({
    async withSecret(_access, consumer) {
      return consumer({ bytes: Buffer.from("ghs_test", "utf8") });
    },
  });
  let vaultFactoryCalls = 0;
  let resolverFactoryCalls = 0;
  let runtimeInput;

  createOperationalRuntime({
    cwd: "/tmp/operator-wave7-explicit",
    env: CONFIGURED_ENV,
    githubSecretProvider: explicitProvider,
    githubVaultClient: {
      async withSecretLease() {
        throw new Error("vault client must not run");
      },
    },
    githubSecretResolver() {
      throw new Error("resolver must not run");
    },
    githubVaultSecretProviderFactory() {
      vaultFactoryCalls += 1;
      throw new Error("vault factory must not run");
    },
    githubSecretProviderFactory() {
      resolverFactoryCalls += 1;
      throw new Error("resolver factory must not run");
    },
    githubTransport: { async requestWithCredential() {} },
    githubRuntimeFactory(input) {
      runtimeInput = input;
      return {
        configured: false,
        descriptor: Object.freeze({
          configured: false,
          mode: "test",
          productionChanged: false,
        }),
      };
    },
    gatewayFactory: gatewayCapture({}),
  });

  assert.equal(vaultFactoryCalls, 0);
  assert.equal(resolverFactoryCalls, 0);
  assert.equal(runtimeInput.secretProvider, explicitProvider);
});

test("vault client keeps precedence over resolver composition", () => {
  const vaultProvider = Object.freeze({
    async withSecret(_access, consumer) {
      return consumer({ bytes: Buffer.from("ghs_test", "utf8") });
    },
  });
  let vaultFactoryInput;
  let resolverFactoryCalls = 0;
  let runtimeInput;

  createOperationalRuntime({
    cwd: "/tmp/operator-wave7-vault",
    env: CONFIGURED_ENV,
    githubVaultClient: Object.freeze({
      async withSecretLease() {},
    }),
    githubSecretResolver() {
      throw new Error("resolver must not run");
    },
    githubVaultSecretProviderFactory(input) {
      vaultFactoryInput = input;
      return vaultProvider;
    },
    githubSecretProviderFactory() {
      resolverFactoryCalls += 1;
      throw new Error("resolver factory must not run");
    },
    githubTransport: { async requestWithCredential() {} },
    githubRuntimeFactory(input) {
      runtimeInput = input;
      return {
        configured: false,
        descriptor: Object.freeze({
          configured: false,
          mode: "test",
          productionChanged: false,
        }),
      };
    },
    gatewayFactory: gatewayCapture({}),
  });

  assert.deepEqual(vaultFactoryInput.allowedSecretRefs, [
    CONFIGURED_ENV.OPERATOR_GITHUB_CREDENTIAL_REF,
  ]);
  assert.equal(
    typeof vaultFactoryInput.vaultClient.withSecretLease,
    "function",
  );
  assert.equal(resolverFactoryCalls, 0);
  assert.equal(runtimeInput.secretProvider, vaultProvider);
});

test("unconfigured GitHub runtime does not instantiate vault provider", () => {
  let vaultFactoryCalls = 0;
  let transportFactoryCalls = 0;
  let runtimeInput;

  const runtime = createOperationalRuntime({
    cwd: "/tmp/operator-wave7-unconfigured",
    env: { API_GATEWAY_STATE_FILE: "state.json" },
    githubVaultClient: {
      async withSecretLease() {
        throw new Error("vault client must not run");
      },
    },
    githubVaultSecretProviderFactory() {
      vaultFactoryCalls += 1;
      throw new Error("vault factory must not run");
    },
    githubTransportFactory() {
      transportFactoryCalls += 1;
      throw new Error("transport factory must not run");
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
    gatewayFactory: gatewayCapture({}),
  });

  assert.equal(vaultFactoryCalls, 0);
  assert.equal(transportFactoryCalls, 0);
  assert.equal(runtimeInput.secretProvider, undefined);
  assert.equal(runtimeInput.transport, undefined);
  assert.equal(runtime.descriptor.githubReadonly.mode, "deny-by-default");
});

test("configured GitHub without provider, vault client or resolver fails closed", () => {
  assert.throws(
    () =>
      createOperationalRuntime({
        cwd: "/tmp/operator-wave7-fail-closed",
        env: CONFIGURED_ENV,
        githubTransport: { async requestWithCredential() {} },
      }),
    /secretProvider\.withSecret must be a function/,
  );
});
