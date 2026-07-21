
import test from "node:test";
import assert from "node:assert/strict";

import {
  createGitHubCommitReader,
  createGitHubReadOnlyPorts,
} from "../src/github-provider.mjs";

const COMMIT = "39d75734dc6315c5a822b9c134f39353fa5359f9";

function requestFixture(overrides = {}) {
  const calls = [];
  const request = async (input) => {
    calls.push(input);
    if (input.operation === "readBlob") {
      return {
        status: 200,
        data: {
          type: "file",
          encoding: "base64",
          content: Buffer.from("# Portal\n", "utf8").toString("base64"),
        },
      };
    }
    return {
      status: 200,
      data: {
        truncated: false,
        tree: [
          { path: "docs/architecture/portal/README.md", type: "blob" },
          { path: "docs/architecture/portal/assets", type: "tree" },
          { path: "docs/other.md", type: "blob" },
        ],
      },
    };
  };
  return { request: overrides.request ?? request, calls };
}

test("creates a commit-pinned reader over injected GitHub transport", async () => {
  const { request, calls } = requestFixture();
  const reader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request,
  });

  const blob = await reader.readText("docs/architecture/portal/README.md");
  const paths = await reader.list("docs/architecture/portal");

  assert.equal(blob.content, "# Portal\n");
  assert.deepEqual(paths, ["docs/architecture/portal/README.md"]);
  assert.equal(reader.commit, COMMIT);
  assert.equal(reader.mutationAllowed, false);
  assert.equal(calls.every((call) => call.method === "GET"), true);
});

test("uses full commit SHA in both GitHub requests", async () => {
  const { request, calls } = requestFixture();
  const reader = createGitHubCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    request,
  });

  await reader.readText("docs/architecture/portal/README.md");
  await reader.list("docs/architecture/portal");

  assert.match(calls[0].url, new RegExp(`ref=${COMMIT}$`));
  assert.match(calls[1].url, new RegExp(`/git/trees/${COMMIT}\\?recursive=1$`));
});

test("rejects mutable refs before network access", () => {
  const { request, calls } = requestFixture();
  assert.throws(
    () => createGitHubCommitReader({
      repository: "sitedauni/apidevelopers-platform",
      commit: "main",
      request,
    }),
    (error) => error.code === "PORTAL_GITHUB_PROVIDER_COMMIT_INVALID",
  );
  assert.equal(calls.length, 0);
});

test("rejects invalid repository coordinates", () => {
  const { request } = requestFixture();
  assert.throws(
    () => createGitHubCommitReader({ repository: "invalid", commit: COMMIT, request }),
    (error) => error.code === "PORTAL_GITHUB_PROVIDER_REPOSITORY_INVALID",
  );
});

test("fails closed on truncated recursive trees", async () => {
  const { request } = requestFixture({
    request: async () => ({
      status: 200,
      data: { truncated: true, tree: [] },
    }),
  });

  const ports = createGitHubReadOnlyPorts({ request });
  await assert.rejects(
    ports.listTree({
      repository: "sitedauni/apidevelopers-platform",
      commit: COMMIT,
      prefix: "docs",
    }),
    (error) => error.code === "PORTAL_GITHUB_PROVIDER_TREE_TRUNCATED",
  );
});

test("fails closed on non-base64 file responses", async () => {
  const ports = createGitHubReadOnlyPorts({
    request: async () => ({
      status: 200,
      data: { type: "file", encoding: "utf-8", content: "# Portal" },
    }),
  });

  await assert.rejects(
    ports.readBlob({
      repository: "sitedauni/apidevelopers-platform",
      commit: COMMIT,
      path: "docs/a.md",
    }),
    (error) => error.code === "PORTAL_GITHUB_PROVIDER_CONTENT_INVALID",
  );
});

test("surfaces HTTP failures without leaking response bodies", async () => {
  const ports = createGitHubReadOnlyPorts({
    request: async () => ({
      status: 404,
      data: { message: "not found", token: "secret" },
    }),
  });

  await assert.rejects(
    ports.readBlob({
      repository: "sitedauni/apidevelopers-platform",
      commit: COMMIT,
      path: "docs/missing.md",
    }),
    (error) =>
      error.code === "PORTAL_GITHUB_PROVIDER_REQUEST_FAILED" &&
      error.details.status === 404 &&
      !JSON.stringify(error.details).includes("secret"),
  );
});

test("provider facade exposes no write operation", () => {
  const { request } = requestFixture();
  const ports = createGitHubReadOnlyPorts({ request });
  assert.equal(ports.mutationAllowed, false);
  assert.equal("write" in ports, false);
  assert.equal("commit" in ports, false);
  assert.equal("updateRef" in ports, false);
  assert.equal("delete" in ports, false);
});
