import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWebsiteCreateDiagnostic,
  publishWebsiteCreateDiagnostic,
} from "../src/hostinger-website-create-diagnostic.mjs";

const repository =
  "apidevelopers-digital/apidevelopers-platform";
const sourceSha =
  "fcb6f419ec0ded006e68a0c6e0bf59ba822b949f";

function json(value, status = 200) {
  return Response.json(value, { status });
}

test("builds sanitized deterministic step diagnostic", () => {
  const input = {
    repository,
    sourceSha,
    workflowRunId: "30606569642",
    workflowRunAttempt: "1",
    eventName: "workflow_dispatch",
    outcomes: {
      validate: "success",
      secret: "success",
      claim: "failure",
      execute: "skipped",
    },
    generatedAt: "2026-07-31T05:21:37.000Z",
  };

  const first = buildWebsiteCreateDiagnostic(input);
  const second = buildWebsiteCreateDiagnostic(input);

  assert.equal(first.failedPhase, "claim");
  assert.equal(first.executable, false);
  assert.equal(
    first.constraints.hostingerPostExecutedByDiagnostic,
    false,
  );
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("publishes diagnostic through GitHub REST API", async () => {
  const calls = [];
  const diagnostic = buildWebsiteCreateDiagnostic({
    repository,
    sourceSha,
    workflowRunId: "30606569642",
    workflowRunAttempt: "1",
    eventName: "workflow_dispatch",
    outcomes: {
      validate: "success",
      secret: "failure",
      claim: "skipped",
      execute: "skipped",
    },
  });

  const result = await publishWebsiteCreateDiagnostic({
    token: "github-token",
    repository,
    sourceSha,
    diagnostic,
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
      if (
        options.method === "GET" &&
        String(url).includes("/contents/")
      ) {
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
