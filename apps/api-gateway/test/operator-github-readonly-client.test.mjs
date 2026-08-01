import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubReadonlyClient,
  GitHubReadonlyClientError,
} from "../src/operator-github-readonly-client.mjs";
import {
  OperatorSecretContractError,
  withOperatorSecret,
} from "../src/operator-secret-provider-contract.mjs";

const secret = Buffer.from("test-only-secret");
function provider({ lease = { bytes: secret, version: "v1" } } = {}) {
  return {
    async withSecret(access, consumer) {
      return consumer(lease);
    },
  };
}

function transport(response, calls = []) {
  return {
    async requestWithCredential(input) {
      calls.push(input);
      return response;
    },
  };
}

function client(response, calls = []) {
  return createGitHubReadonlyClient({
    transport: transport(response, calls),
    secretProvider: provider(),
    credentialRef: "vault://github/operator-readonly",
  });
}

test("requires opaque credential reference and injected transport", () => {
  assert.throws(
    () => createGitHubReadonlyClient({ transport: {}, secretProvider: provider(), credentialRef: "vault://x/y" }),
    /requestWithCredential/,
  );
  assert.throws(
    () => createGitHubReadonlyClient({ transport: transport({}), secretProvider: provider(), credentialRef: "env://TOKEN" }),
    (error) => error instanceof OperatorSecretContractError && error.code === "invalid_secret_ref",
  );
});

test("getOrganization uses temporary bytes and returns only login", async () => {
  const calls = [];
  const value = await client(
    { status: 200, body: { login: "apidevelopers-digital", token: "never" } },
    calls,
  ).getOrganization({
    organization: "apidevelopers-digital",
    correlationId: "corr_001",
    tenantId: "uni.",
  });
  assert.deepEqual(value, { login: "apidevelopers-digital" });
  assert.equal(calls[0].credential.scheme, "bearer");
  assert.ok(calls[0].credential.bytes instanceof Uint8Array);
  assert.equal("authorization" in calls[0].request.headers, false);
  assert.equal(JSON.stringify(value).includes("never"), false);
});

test("getRepository strips raw GitHub fields", async () => {
  const value = await client({
    status: 200,
    body: {
      name: "apidevelopers-platform",
      full_name: "apidevelopers-digital/apidevelopers-platform",
      archived: false,
      disabled: false,
      permissions: { admin: true },
      clone_url: "https://example.invalid/private",
    },
  }).getRepository({
    owner: "apidevelopers-digital",
    repository: "apidevelopers-platform",
  });
  assert.deepEqual(value, {
    name: "apidevelopers-platform",
    full_name: "apidevelopers-digital/apidevelopers-platform",
    archived: false,
    disabled: false,
  });
});

test("list repositories is bounded and parses next page", async () => {
  const value = await client({
    status: 200,
    headers: {
      link: '<https://api.github.com/orgs/apidevelopers-digital/repos?page=2&per_page=2>; rel="next"',
    },
    body: [
      { name: "one", full_name: "apidevelopers-digital/one" },
      { name: "two", full_name: "apidevelopers-digital/two", archived: true },
    ],
  }).listOrganizationRepositories({
    organization: "apidevelopers-digital",
    perPage: 2,
  });
  assert.equal(value.nextPage, 2);
  assert.deepEqual(value.items.map(({ name, archived }) => [name, archived]), [
    ["one", false],
    ["two", true],
  ]);
});

test("non-success and transport failures are sanitized", async () => {
  await assert.rejects(
    client({ status: 403, body: { message: "secret detail" } }).getOrganization({
      organization: "apidevelopers-digital",
    }),
    (error) =>
      error instanceof GitHubReadonlyClientError &&
      error.status === 403 &&
      !error.message.includes("secret detail"),
  );

  const value = createGitHubReadonlyClient({
    transport: {
      async requestWithCredential() {
        throw new Error("network secret detail");
      },
    },
    secretProvider: provider(),
    credentialRef: "secret://github/operator-readonly",
  });
  await assert.rejects(
    value.getOrganization({ organization: "apidevelopers-digital" }),
    (error) =>
      error instanceof GitHubReadonlyClientError &&
      error.code === "github_transport_unavailable" &&
      !error.message.includes("network secret detail"),
  );
});

test("secret lease rejects strings and wipes copied bytes", async () => {
  await assert.rejects(
    withOperatorSecret({
      secretProvider: provider({ lease: { bytes: "plain-string" } }),
      access: { secretRef: "vault://github/x", purpose: "github.readonly.test" },
      consumer: async () => ({}),
    }),
    (error) =>
      error instanceof OperatorSecretContractError &&
      error.code === "secret_contract_violation",
  );

  const lease = { bytes: Buffer.from("wipe-me") };
  await withOperatorSecret({
    secretProvider: provider({ lease }),
    access: { secretRef: "vault://github/x", purpose: "github.readonly.test" },
    consumer: async ({ bytes }) => ({ ok: true, copy: bytes.length }),
  });
  assert.equal(lease.bytes.toString(), "wipe-me");
});