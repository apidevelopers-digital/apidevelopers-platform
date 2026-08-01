import assert from "node:assert/strict";
import test from "node:test";

import { createOperatorGitHubReadonlyStack } from "../src/operator-github-readonly-stack.mjs";

const ORGANIZATION = "apidevelopers-digital";
const REF = "vault://github/operator-readonly";
const FIXED_NOW = "2026-08-01T23:55:00.000Z";

function now() {
  return new Date(FIXED_NOW);
}

function createFixture() {
  const calls = [];
  const vaultAccesses = [];

  const vaultClient = {
    async withSecretLease(access, consumer) {
      vaultAccesses.push(access);
      const bytes = Buffer.from("fixture-only-token");
      try {
        return await consumer({
          bytes,
          version: "fixture-v1",
          expiresAt: "2026-08-01T23:56:00.000Z",
        });
      } finally {
        bytes.fill(0);
      }
    },
  };

  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(init.method, "GET");
    assert.equal(init.headers.authorization, "Bearer fixture-only-token");
    assert.equal(init.redirect, "error");
    assert.equal(init.credentials, "omit");

    const parsed = new URL(url);
    if (parsed.pathname === `/orgs/${ORGANIZATION}`) {
      return new Response(
        JSON.stringify({
          login: ORGANIZATION,
          private_payload: "discarded",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    if (parsed.pathname === `/orgs/${ORGANIZATION}/repos`) {
      return new Response(
        JSON.stringify([
          {
            name: "apidevelopers-platform",
            full_name: `${ORGANIZATION}/apidevelopers-platform`,
            archived: false,
            disabled: false,
            permissions: { admin: true },
          },
          {
            name: "apidevelopers-ops",
            full_name: `${ORGANIZATION}/apidevelopers-ops`,
            archived: true,
            disabled: false,
          },
        ]),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            link: `<https://api.github.com/orgs/${ORGANIZATION}/repos?type=all&page=2&per_page=2>; rel="next"`,
            "set-cookie": "forbidden=1",
          },
        },
      );
    }

    throw new Error("unexpected fixture URL");
  };

  return { calls, vaultAccesses, vaultClient, fetchImpl };
}

test("complete read-only stack composes vault, egress, transport, client and adapter", async () => {
  const fixture = createFixture();
  const stack = createOperatorGitHubReadonlyStack({
    vaultClient: fixture.vaultClient,
    fetchImpl: fixture.fetchImpl,
    credentialRef: REF,
    organization: ORGANIZATION,
    now,
  });

  const status = await stack.adapters.status({
    target: {
      provider: "github",
      resourceType: "organization",
      resourceId: ORGANIZATION,
    },
  });
  assert.equal(status.items[0].state, "online");
  assert.equal(status.items[0].resourceId, `github:organization:${ORGANIZATION}`);

  const inventory = await stack.adapters.inventory({
    target: {
      provider: "github",
      resourceType: "repository",
    },
    limit: 2,
  });

  assert.deepEqual(
    inventory.items.map(({ resourceId, status }) => [resourceId, status]),
    [
      [`${ORGANIZATION}/apidevelopers-platform`, "online"],
      [`${ORGANIZATION}/apidevelopers-ops`, "attention"],
    ],
  );
  assert.equal(inventory.cursor, "github_repo_page_2");
  assert.equal(stack.descriptor.runtimeActivated, false);
  assert.equal(stack.descriptor.productionChanged, false);
  assert.equal(stack.descriptor.credentialConfigured, true);

  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.vaultAccesses.length, 2);
  assert.ok(
    fixture.calls.every(({ url }) => new URL(url).hostname === "api.github.com"),
  );
  assert.ok(
    fixture.vaultAccesses.every(({ secretRef }) => secretRef === REF),
  );

  const serialized = JSON.stringify({ status, inventory, descriptor: stack.descriptor });
  assert.equal(serialized.includes("fixture-only-token"), false);
  assert.equal(serialized.includes("permissions"), false);
  assert.equal(serialized.includes("set-cookie"), false);
});

test("complete stack remains deny-by-default for secret reference and egress origin", async () => {
  const fixture = createFixture();
  const stack = createOperatorGitHubReadonlyStack({
    vaultClient: fixture.vaultClient,
    fetchImpl: fixture.fetchImpl,
    credentialRef: REF,
    organization: ORGANIZATION,
    now,
  });

  await assert.rejects(
    stack.secretProvider.withSecret(
      {
        secretRef: "vault://github/not-allowed",
        purpose: "github.readonly.test",
      },
      async () => ({}),
    ),
    (error) => error.code === "vault_reference_denied",
  );

  assert.throws(
    () =>
      stack.egressPolicy.authorize({
        method: "GET",
        url: `https://example.invalid/orgs/${ORGANIZATION}`,
      }),
    (error) => error.code === "egress_url_denied",
  );
  assert.equal(fixture.calls.length, 0);
});

test("complete stack has no implicit network or vault fallback", () => {
  assert.throws(
    () =>
      createOperatorGitHubReadonlyStack({
        vaultClient: {},
        fetchImpl: async () => new Response("{}"),
        credentialRef: REF,
        organization: ORGANIZATION,
      }),
    /withSecretLease/,
  );

  assert.throws(
    () =>
      createOperatorGitHubReadonlyStack({
        vaultClient: { async withSecretLease() {} },
        credentialRef: REF,
        organization: ORGANIZATION,
      }),
    /fetchImpl/,
  );

  assert.throws(
    () =>
      createOperatorGitHubReadonlyStack({
        vaultClient: { async withSecretLease() {} },
        fetchImpl: async () => new Response("{}"),
        credentialRef: "env://GITHUB_TOKEN",
        organization: ORGANIZATION,
      }),
    (error) => error.code === "invalid_secret_ref",
  );
});
