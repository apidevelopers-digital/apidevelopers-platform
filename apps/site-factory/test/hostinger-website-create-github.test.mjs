import test from "node:test";
import assert from "node:assert/strict";

import {
  publishExecutionEvidence,
  readExecutionEvidence,
  readGithubJson,
} from "../src/hostinger-website-create-github.mjs";
import {
  json,
  repository,
  sourceSha,
} from "./hostinger-website-create-fixture.mjs";

test("reads pinned JSON content through GitHub API", async () => {
  const expected = { kind: "draft" };
  const result = await readGithubJson({
    token: "github-token",
    repository,
    ref: sourceSha,
    path: "evidence.json",
    apiBaseUrl: "https://api.github.test",
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "GET");
      return json({
        content: Buffer.from(JSON.stringify(expected)).toString("base64"),
      });
    },
  });

  assert.deepEqual(result, expected);
});

test("returns null when execution evidence does not exist", async () => {
  const result = await readExecutionEvidence({
    token: "github-token",
    repository,
    apiBaseUrl: "https://api.github.test",
    fetchImpl: async () => new Response("", { status: 404 }),
  });

  assert.equal(result, null);
});

test("creates branch and publishes execution evidence", async () => {
  const calls = [];
  const evidence = {
    source: { workflowRunId: "123" },
    outcome: "created",
  };

  const result = await publishExecutionEvidence({
    token: "github-token",
    repository,
    sourceSha,
    evidence,
    apiBaseUrl: "https://api.github.test",
    fetchImpl: async (url, options) => {
      calls.push({
        url: String(url),
        method: options.method,
        body: options.body,
      });

      if (String(url).includes("/git/ref/heads/")) {
        return new Response("", { status: 404 });
      }
      if (String(url).endsWith("/git/refs")) {
        return json({}, 201);
      }
      if (options.method === "GET") {
        return new Response("", { status: 404 });
      }
      return json(
        {
          commit: { sha: "commit-sha" },
          content: { sha: "content-sha" },
        },
        201,
      );
    },
  });

  assert.equal(result.commitSha, "commit-sha");
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET", "POST", "GET", "PUT"],
  );
  assert.doesNotMatch(JSON.stringify(calls), /github-token/);
});
