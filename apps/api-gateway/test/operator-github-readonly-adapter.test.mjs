import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubReadonlyAdapters,
} from "../src/operator-github-readonly-adapter.mjs";
import { OperatorReadonlyError } from "../src/operator-readonly-contract.mjs";

const NOW = "2026-08-01T22:30:00.000Z";
const ORG_TARGET = Object.freeze({
  provider: "github",
  resourceType: "organization",
});
const REPOSITORY_TARGET = Object.freeze({
  provider: "github",
  resourceType: "repository",
});
const REQUEST = Object.freeze({
  tenant: "uni.",
  operator: "operator-igor",
  correlationId: "corr_github_001",
  includeContent: false,
  includeRows: false,
  includeValues: false,
  limit: 50,
});

test("requires an injected client and configured organization", () => {
  assert.throws(
    () => createGitHubReadonlyAdapters(),
    /client must be an object/,
  );
  assert.throws(
    () => createGitHubReadonlyAdapters({ client: {}, organization: "../bad" }),
    /valid GitHub organization/,
  );
});

test("operatorStatus reports configured organization reachability", async () => {
  const calls = [];
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    now: () => NOW,
    client: {
      async getOrganization(input) {
        calls.push(input);
        return {
          login: "apidevelopers-digital",
          token: "must-never-be-returned",
        };
      },
    },
  });

  const result = await adapters.status({
    ...REQUEST,
    target: ORG_TARGET,
  });

  assert.deepEqual(calls, [
    { organization: "apidevelopers-digital" },
  ]);
  assert.deepEqual(result, {
    items: [
      {
        resourceId: "github:organization:apidevelopers-digital",
        kind: "organization",
        state: "online",
        checkedAt: NOW,
        message: "github organization reachable",
      },
    ],
  });
  assert.equal(JSON.stringify(result).includes("token"), false);
});


test("operatorStatus rejects a mismatched organization descriptor", async () => {
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    now: () => NOW,
    client: {
      async getOrganization() {
        return { login: "other-organization" };
      },
    },
  });

  await assert.rejects(
    adapters.status({
      ...REQUEST,
      target: ORG_TARGET,
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "provider_contract_violation",
  );
});

test("operatorStatus maps archived repository without exposing provider fields", async () => {
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    now: () => NOW,
    client: {
      async getRepository(input) {
        assert.deepEqual(input, {
          owner: "apidevelopers-digital",
          repository: "apidevelopers-platform",
        });
        return {
          name: "apidevelopers-platform",
          full_name: "apidevelopers-digital/apidevelopers-platform",
          archived: true,
          disabled: false,
          permissions: { admin: true },
          private: false,
        };
      },
    },
  });

  const result = await adapters.status({
    ...REQUEST,
    target: {
      ...REPOSITORY_TARGET,
      resourceId: "apidevelopers-digital/apidevelopers-platform",
    },
  });

  assert.deepEqual(result.items[0], {
    resourceId: "apidevelopers-digital/apidevelopers-platform",
    kind: "repository",
    state: "attention",
    checkedAt: NOW,
    message: "github repository archived",
  });
  assert.equal(JSON.stringify(result).includes("permissions"), false);
});

test("operatorStatus converts upstream access errors into sanitized blocked state", async () => {
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    now: () => NOW,
    client: {
      async getOrganization() {
        const error = new Error("Bearer secret-value rejected");
        error.status = 403;
        throw error;
      },
    },
  });

  const result = await adapters.status({
    ...REQUEST,
    target: ORG_TARGET,
  });

  assert.equal(result.items[0].state, "blocked");
  assert.equal(result.items[0].message, "github access denied");
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
});

test("operatorInventory returns bounded repository descriptors and opaque cursor", async () => {
  const calls = [];
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    now: () => NOW,
    client: {
      async listOrganizationRepositories(input) {
        calls.push(input);
        return {
          items: [
            {
              name: "apidevelopers-platform",
              full_name: "apidevelopers-digital/apidevelopers-platform",
              archived: false,
              disabled: false,
              clone_url: "https://example.invalid/secret",
              permissions: { admin: true },
            },
            {
              name: "legacy-runtime",
              full_name: "apidevelopers-digital/legacy-runtime",
              archived: true,
              disabled: false,
              token: "never-return",
            },
          ],
          nextPage: 2,
        };
      },
    },
  });

  const result = await adapters.inventory({
    ...REQUEST,
    target: REPOSITORY_TARGET,
    limit: 150,
  });

  assert.deepEqual(calls, [
    {
      organization: "apidevelopers-digital",
      page: 1,
      perPage: 100,
      type: "all",
    },
  ]);
  assert.equal(result.cursor, "github_repo_page_2");
  assert.deepEqual(result.items, [
    {
      resourceId: "apidevelopers-digital/apidevelopers-platform",
      kind: "repository",
      name: "apidevelopers-platform",
      status: "online",
      parentId: "github:organization:apidevelopers-digital",
      capabilities: ["github:repository:metadata:read"],
    },
    {
      resourceId: "apidevelopers-digital/legacy-runtime",
      kind: "repository",
      name: "legacy-runtime",
      status: "attention",
      parentId: "github:organization:apidevelopers-digital",
      capabilities: ["github:repository:metadata:read"],
    },
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("clone_url"), false);
  assert.equal(serialized.includes("permissions"), false);
  assert.equal(serialized.includes("never-return"), false);
});

test("operatorInventory validates cursor and configured organization boundary", async () => {
  const calls = [];
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    client: {
      async listOrganizationRepositories(input) {
        calls.push(input);
        return [];
      },
    },
  });

  await adapters.inventory({
    ...REQUEST,
    target: REPOSITORY_TARGET,
    cursor: "github_repo_page_7",
  });
  assert.equal(calls[0].page, 7);

  await assert.rejects(
    adapters.inventory({
      ...REQUEST,
      target: REPOSITORY_TARGET,
      cursor: "../page/2",
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "invalid_request",
  );

  await assert.rejects(
    adapters.status({
      ...REQUEST,
      target: {
        ...ORG_TARGET,
        resourceId: "other-organization",
      },
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "invalid_request",
  );
});

test("operatorInventory rejects unsupported provider and sanitizes upstream failure", async () => {
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    client: {
      async listOrganizationRepositories() {
        const error = new Error("credential secret-value failed");
        error.status = 403;
        throw error;
      },
    },
  });

  await assert.rejects(
    adapters.inventory({
      ...REQUEST,
      target: { provider: "hostinger", resourceType: "repository" },
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable",
  );

  await assert.rejects(
    adapters.inventory({
      ...REQUEST,
      target: REPOSITORY_TARGET,
    }),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable" &&
      !error.message.includes("secret-value"),
  );
});

test("operatorRead and operatorAudit remain unavailable in the GitHub metadata block", async () => {
  const adapters = createGitHubReadonlyAdapters({
    organization: "apidevelopers-digital",
    client: {},
  });

  await assert.rejects(
    adapters.read({}),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable",
  );
  await assert.rejects(
    adapters.audit({}),
    (error) =>
      error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailble",
  );
});
