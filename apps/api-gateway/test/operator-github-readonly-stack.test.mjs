import assert from "node:assert/strict";
import test from "node:test";

import {
  createOperatorGitHubReadonlyStack,
} from "../src/operator-github-readonly-stack.mjs";

import {
  OperatorVaultSecretProviderError,
} from "../src/operator-vault-secret-provider.mjs";
import {
  OperatorHttpsCredentialTransportError,
} from "../src/operator-https-credential-transport.mjs";

const NOW = "2026-08-01T23:50:00.000Z";
const REF = "vault://github/operator-readonly";
const ORG = "apidevelopers-digital";

function fixedNow() {
  return new Date(NOW);
}

function createFixtureVault(calls = []) {
  return {
    async withSecretLease(access, consumer) {
      calls.push(access);
      const secret = Buffer.from("fixture-only-token");
      try {
        return await consumer({
          bytes: secret,
          version: "fixture-v1",
          expiresAt: "2026-08-01T23:51:00.000Z",
        });
      } finally {
        secret.fill(0);
      }
    },
  };
}

function createFixtureFetch(calls = []) {
  return async (url, init) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;

    if (path === `/orgs/${ORG}`) {
      return new Response(
        JSON.stringify({ login: ORG, token: "must-not-leak" }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-ratelimit-remaining": "4999",
            "set-cookie": "forbidden=1",
          },
        },
      );
    }

    if (path === `/orgs/${ORG}/repos`) {
      return new Response(
        JSON.stringify([
          {
            name: "apidevelopers-institution",
            full_name: `${ORG}/apidevelopers-institution`,
            archived: false,
            disabled: false,
            permissions: { admin: true },
          },
          {
            name: "legacy-read-only",
            full_name: `${ORG}/legacy-read-only`,
            archived: true,
            disabled: false,
          },
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            link: `<https://api.github.com/orgs/${ORG}/repos?page=2&per_page=2>, rel="next"`,
          },
        },
      );
    }

    return new Response(JSON.stringify({ message: "not found" }), { status: 404 });
  };
}

test("composed stack performs read-only status and inventory with fixtures only", async () => {
  const vaultCalls = [];
  const fetchCalls = [];
  const stack = createOperatorGitHubReadonlyStack({
    vaultClient: createFixtureVault(vaultCalls),
    fetchImpl: createFixtureFetch(fetchCalls),
    credentialRef: REF,
    organization: ORG,
    now: fixedNow,
  });

  const status = await stack.adapters.status({
    target: {
      provider: "github",
      resourceType: "organization",
      resourceId: ORG,
    },
  });

  const inventory = await stack.adapters.inventory({
    target: {
      provider: "github",
      resourceType: "repository",
    },
    limit: 2,
  });

  assert.equal(status.items[0].state, "online");
  assert.deepEqual(inventory.items.map((item) => [item.name, item.status]), [
    ["apidevelopers-institution", "online"],
    ["legacy-read-only", "attention"],
  ]);
  assert.equal(inventory.cursor, "github_repo_page_2");
  assert.equal(stack.descriptor.runtimeActivated, false);
  assert.equal(stack.descriptor.productionChanged, false);
  assert.equal(vaultCalls.length, 2);
  assert.equal(fetchCalls.length, 2);
  for (const call of fetchCalls) {
    assert.equal(call.init.headers.authorization, "Bearer fixture-only-token");
    assert.equal(call.init.method, "GET");
    assert.equal(call.init.redirect, "error");
  }

  const serialized = JSON.stringify({ status, inventory });
  assert.equal(serialized.includes("fixture-only-token"), false);
  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("permissions"), false);
});

test("composed stack denies secret reference and egress outside the configured boundary", async () => {
  const stack = createOperatorGitHubReadonlyStack({
    vaultClient: createFixtureVault(),
    fetchImpl: createFixtureFetch(),
    credentialRef: REF,
    organization: ORG,
    now: fixedNow,
  });

  await assert.rejects(
    stack.secretProvider.withSecret(
      { secretRef: "vault://github/other", purpose: "github.readonly.test" },
     async () => ({}),
    ),
    (error) =>
      error instanceof OperatorVaultSecretProviderError &&
      error.code === "vault_reference_denied",
  );

  await assert.rejects(
    stack.transport.requestWithCredential({
      request: {
        method: "GET",
        url: "https://evil.invalid/orgs/x",
      },
      credential: { scheme: "bearer", bytes: Buffer.from("fixture") },
    }),
    (error) =>
      error instanceof OperatorHttpsCredentialTransportError &&
      error.status === 403,
  );
});

test("composed stack has no implicit fetch or environment secret fallback", () => {
  assert.throws(
    () =>
      createOperatorGitHubReadonlyStack({
        vaultClient: createFixtureVault(),
        credentialRef: REF,
        organization: ORG,
      }),
    /fetchImpl must be a function/,
  );

  assert.throws(
    () =>
      createOperatorGitHubReadonlyStack({
        vaultClient: createFixtureVault(),
        fetchImpl: createFixtureFetch(),
        credentialRef: "env://GITHUB_TOKEN",
        organization: ORG,
      }),
    /invalid_secret_ref/,
  );
});
