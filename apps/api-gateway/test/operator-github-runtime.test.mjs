import assert from "node:assert/strict";
import test from "node:test";

import {
  OperatorGitHubRuntimeError,
  createOperatorGitHubRuntime,
  resolveOperatorGitHubRuntimeConfig,
} from "../src/operator-github-runtime.mjs";
import {
  createOperationalRuntime,
} from "../src/operational-runtime.mjs";

function syntheticToken(length = 520) {
  const prefix = "ghs_";
  return prefix + "A".repeat(length - prefix.length);
}

function provider(bytes) {
  return {
    async withSecret(_access, consumer) {
      return consumer({
        bytes,
        version: "synthetic-stateless-v1",
      });
    },
  };
}

test("GitHub runtime remains deny-by-default when no configuration exists", () => {
  assert.deepEqual(resolveOperatorGitHubRuntimeConfig({ env: {} }), {
    configured: false,
    reason: "github_readonly_not_configured",
  });

  const runtime = createOperatorGitHubRuntime({ env: {} });
  assert.equal(runtime.configured, false);
  assert.equal(runtime.descriptor.mode, "deny-by-default");
  assert.equal(runtime.descriptor.productionChanged, false);
});

test("GitHub runtime rejects direct token material and partial configuration", () => {
  assert.throws(
    () =>
      resolveOperatorGitHubRuntimeConfig({
        env: { OPERATOR_GITHUB_TOKEN: "ghs_forbidden" },
      }),
    (error) =>
      error instanceof OperatorGitHubRuntimeError &&
      error.code === "direct_github_token_forbidden",
  );

  assert.throws(
    () =>
      resolveOperatorGitHubRuntimeConfig({
        env: {
          OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
        },
      }),
    (error) =>
      error instanceof OperatorGitHubRuntimeError &&
      error.code === "incomplete_github_runtime_config",
  );
});

test("GitHub runtime wires opaque 520-byte credential through explicit provider and transport", async () => {
  const token = syntheticToken();
  const tokenBytes = Buffer.from(token, "utf8");
  let observed;

  const runtime = createOperatorGitHubRuntime({
    env: {
      OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
      OPERATOR_GITHUB_CREDENTIAL_REF:
        "vault://github/operator-readonly-installation-token",
    },
    secretProvider: provider(tokenBytes),
    transport: {
      async requestWithCredential(input) {
        observed = {
          byteLength: input.credential.bytes.byteLength,
          tokenMatches:
            Buffer.from(input.credential.bytes).toString("utf8") === token,
          method: input.request.method,
          authorizationHeaderPresent: Object.keys(
            input.request.headers,
          ).some((name) => name.toLowerCase() === "authorization"),
        };
        return {
          status: 200,
          body: { login: "apidevelopers-digital" },
        };
      },
    },
  });

  assert.equal(runtime.configured, true);
  assert.equal(runtime.organization, "apidevelopers-digital");
  assert.equal(runtime.descriptor.directTokenAccepted, false);
  assert.equal(runtime.descriptor.tokenMaterialLoadedDuringComposition, false);

  const result = await runtime.client.getOrganization({
    organization: runtime.organization,
    correlationId: "corr_runtime_001",
    tenantId: "uni.operator",
  });

  assert.deepEqual(result, { login: "apidevelopers-digital" });
  assert.deepEqual(observed, {
    byteLength: 520,
    tokenMatches: true,
    method: "GET",
    authorizationHeaderPresent: false,
  });
});

test("operational runtime injects GitHub readonly dependencies only when configured", () => {
  const stateFile = "state/operator-runtime.json";
  let captured;

  const runtime = createOperationalRuntime({
    env: {
      API_GATEWAY_STATE_FILE: stateFile,
      OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
      OPERATOR_GITHUB_CREDENTIAL_REF:
        "secret://github/operator-readonly-installation-token",
    },
    cwd: "/tmp/operator-runtime-test",
    githubSecretProvider: provider(Buffer.from(syntheticToken(), "utf8")),
    githubTransport: {
      async requestWithCredential() {
        return {
          status: 200,
          body: { login: "apidevelopers-digital" },
        };
      },
    },
    gatewayFactory(options) {
      captured = options;
      return {
        app: { async handleRequest() {} },
        readiness: Object.freeze({}),
        store: Object.freeze({}),
      };
    },
  });

  assert.equal(
    captured.githubReadonlyOrganization,
    "apidevelopers-digital",
  );
  assert.equal(
    typeof captured.githubReadonlyClient.getOrganization,
    "function",
  );
  assert.equal(runtime.descriptor.githubReadonly.configured, true);
  assert.equal(runtime.descriptor.githubReadonly.productionChanged, false);
  assert.equal(
    Object.hasOwn(runtime.descriptor.githubReadonly, "credentialRef"),
    false,
  );
});
