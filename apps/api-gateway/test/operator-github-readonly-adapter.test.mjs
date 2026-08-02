import assert from "node:assert/strict";
import test from "node:test";

import { createGitHubReadonlyAdapters } from "../src/operator-github-readonly-adapter.mjs";
import { OperatorReadonlyError } from "../src/operator-readonly-contract.mjs";

const NOW = "2026-08-01T22:30:00.000Z";
const BASE = Object.freeze({
  tenant: "uni.",
  operator: "operator-igor",
  correlationId: "corr_github_001",
  includeContent: false,
  includeRows: false,
  includeValues: false,
});
const ORG = Object.freeze({ provider: "github", resourceType: "organization" });
const REPOS = Object.freeze({ provider: "github", resourceType: "repository" });

function adapters(client) {
  return createGitHubReadonlyAdapters({
    client,
    organization: "apidevelopers-digital",
    now: () => NOW,
  });
}

test("requires injected client and safe organization", () => {
  assert.throws(() => createGitHubReadonlyAdapters(), /client must be an object/);
  assert.throws(
    () => createGitHubReadonlyAdapters({ client: {}, organization: "../bad" }),
    /valid GitHub organization/,
  );
});

test("status reports organization without returning provider secrets", async () => {
  const result = await adapters({
    async getOrganization() {
      return { login: "apidevelopers-digital", token: "never-return" };
    },
  }).status({ ...BASE, target: ORG });

  assert.deepEqual(result, {
    items: [{
      resourceId: "github:organization:apidevelopers-digital",
      kind: "organization",
      state: "online",
      checkedAt: NOW,
      message: "github organization reachable",
    }],
  });
  assert.equal(JSON.stringify(result).includes("never-return"), false);
});

test("status enforces organization boundary and repository ownership", async () => {
  await assert.rejects(
    adapters({ async getOrganization() { return { login: "other" }; } })
      .status({ ...BASE, target: ORG }),
    (error) => error instanceof OperatorReadonlyError &&
      error.code === "provider_contract_violation",
  );

  await assert.rejects(
    adapters({ async getRepository() { return { name: "repo", full_name: "other/repo" }; } })
      .status({
        ...BASE,
        target: { ...REPOS, resourceId: "apidevelopers-digital/repo" },
      }),
    (error) => error instanceof OperatorReadonlyError &&
      error.code === "provider_contract_violation",
  );
});

test("status sanitizes upstream denial and archived repository state", async () => {
  const denied = await adapters({
    async getOrganization() {
      const error = new Error("Bearer secret-value rejected");
      error.status = 403;
      throw error;
    },
  }).status({ ...BASE, target: ORG });

  assert.equal(denied.items[0].state, "blocked");
  assert.equal(denied.items[0].message, "github access denied");
  assert.equal(JSON.stringify(denied).includes("secret-value"), false);

  const archived = await adapters({
    async getRepository() {
      return {
        name: "apidevelopers-platform",
        full_name: "apidevelopers-digital/apidevelopers-platform",
        archived: true,
      };
    },
  }).status({
    ...BASE,
    target: {
      ...REPOS,
      resourceId: "apidevelopers-digital/apidevelopers-platform",
    },
  });
  assert.equal(archived.items[0].state, "attention");
});

test("inventory returns bounded sanitized descriptors and opaque cursor", async () => {
  const calls = [];
  const result = await adapters({
    async listOrganizationRepositories(input) {
      calls.push(input);
      return {
        items: [
          {
            name: "apidevelopers-platform",
            full_name: "apidevelopers-digital/apidevelopers-platform",
            clone_url: "https://example.invalid/private",
            permissions: { admin: true },
          },
          {
            name: "legacy-runtime",
            full_name: "apidevelopers-digital/legacy-runtime",
            archived: true,
            token: "never-return",
          },
        ],
        nextPage: 2,
      };
    },
  }).inventory({ ...BASE, target: REPOS, limit: 150 });

  assert.deepEqual(calls, [{
    organization: "apidevelopers-digital",
    page: 1,
    perPage: 100,
    type: "all",
  }]);
  assert.equal(result.cursor, "github_repo_page_2");
  assert.deepEqual(result.items.map(({ resourceId, status }) => [resourceId, status]), [
    ["apidevelopers-digital/apidevelopers-platform", "online"],
    ["apidevelopers-digital/legacy-runtime", "attention"],
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("clone_url"), false);
  assert.equal(serialized.includes("permissions"), false);
  assert.equal(serialized.includes("never-return"), false);
});

test("inventory validates cursor, provider and upstream failure", async () => {
  const ok = adapters({ async listOrganizationRepositories() { return []; } });
  await assert.rejects(
    ok.inventory({ ...BASE, target: REPOS, cursor: "../page/2" }),
    (error) => error instanceof OperatorReadonlyError &&
      error.code === "invalid_request",
  );
  await assert.rejects(
    ok.inventory({
      ...BASE,
      target: { provider: "hostinger", resourceType: "repository" },
    }),
    (error) => error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable",
  );

  const failed = adapters({
    async listOrganizationRepositories() {
      const error = new Error("credential secret-value failed");
      error.status = 403;
      throw error;
    },
  });
  await assert.rejects(
    failed.inventory({ ...BASE, target: REPOS }),
    (error) => error instanceof OperatorReadonlyError &&
      error.code === "adapter_unavailable" &&
      !error.message.includes("secret-value"),
  );
});

test("read and audit remain unavailable in this metadata block", async () => {
  const value = adapters({});
  for (const operation of [value.read, value.audit]) {
    await assert.rejects(
      operation({}),
      (error) => error instanceof OperatorReadonlyError &&
        error.code === "adapter_unavailable",
    );
  }
});
