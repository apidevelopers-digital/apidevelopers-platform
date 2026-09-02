import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperatorGitHubRuntime,
} from "../src/operator-github-runtime.mjs";

function provider() {
  return {
    async withSecret(_access, consumer) {
      return consumer({
        bytes: Buffer.from("synthetic-runtime-secret"),
        version: "v1",
      });
    },
  };
}

test("GitHub runtime composes readonly metadata and Actions evidence clients over the same governed dependencies", async () => {
  const observed = {
    readonly: null,
    evidence: null,
  };
  const transport = {
    async requestWithCredential() {
      throw new Error("transport should not be called by synthetic clients");
    },
  };
  const secretProvider = provider();

  const runtime = createOperatorGitHubRuntime({
    env: {
      OPERATOR_GITHUB_ORGANIZATION: "apidevelopers-digital",
      OPERATOR_GITHUB_CREDENTIAL_REF:
        "vault://github/operator-readonly-installation-token",
    },
    secretProvider,
    transport,
    clientFactory(options) {
      observed.readonly = options;
      return Object.freeze({
        async getOrganization() {
          return { login: "apidevelopers-digital" };
        },
      });
    },
    actionsEvidenceClientFactory(options) {
      observed.evidence = options;
      return Object.freeze({
        async getWorkflowRunEvidence(input) {
          return { repository: `${input.owner}/${input.repository}` };
        },
      });
    },
  });

  assert.equal(runtime.configured, true);
  assert.equal(runtime.descriptor.actionsEvidenceReadOnlyConfigured, true);
  assert.equal(runtime.descriptor.productionChanged, false);
  assert.equal(typeof runtime.client.getOrganization, "function");
  assert.equal(typeof runtime.client.getWorkflowRunEvidence, "function");

  assert.equal(observed.readonly.secretProvider, secretProvider);
  assert.equal(observed.evidence.secretProvider, secretProvider);
  assert.equal(observed.readonly.transport, transport);
  assert.equal(observed.evidence.transport, transport);
  assert.equal(
    observed.readonly.credentialRef,
    "vault://github/operator-readonly-installation-token",
  );
  assert.equal(
    observed.evidence.credentialRef,
    "vault://github/operator-readonly-installation-token",
  );

  const result = await runtime.client.getWorkflowRunEvidence({
    owner: "apidevelopers-digital",
    repository: "imuni",
    runId: 33523154986,
  });
  assert.deepEqual(result, {
    repository: "apidevelopers-digital/imuni",
  });
});
