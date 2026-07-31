import test from "node:test";
import assert from "node:assert/strict";

import {
  buildExecutionLock,
  claimExecutionLock,
  readExecutionLock,
} from "../src/hostinger-website-create-lock.mjs";
import {
  json,
  makeApproval,
  makeDraft,
  repository,
  sourceSha,
} from "./hostinger-website-create-fixture.mjs";
import {
  validateCreateAuthorization,
} from "../src/hostinger-website-create-contract.mjs";

const authorization = () => {
  const draft = makeDraft();
  return validateCreateAuthorization({
    draft,
    approval: makeApproval(draft),
    expectedFingerprint: draft.fingerprint,
    expectedRepository: repository,
    now: new Date("2026-07-31T03:50:00.000Z"),
    maxDraftAgeMs: 6 * 60 * 60 * 1000,
  });
};

test("builds deterministic non-executable single-use lock", () => {
  const input = {
    authorization: authorization(),
    repository,
    sourceSha,
    workflowRunId: "123",
    claimedAt: "2026-07-31T03:51:00.000Z",
  };
  const first = buildExecutionLock(input);
  const second = buildExecutionLock(input);

  assert.equal(first.status, "claimed");
  assert.equal(first.singleUse, true);
  assert.equal(first.executable, false);
  assert.equal(first.hostinger.postExecuted, false);
  assert.equal(first.target.datacenterCode, "ascenty");
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("creates execution branch and lock through GitHub API", async () => {
  const calls = [];
  const lock = buildExecutionLock({
    authorization: authorization(),
    repository,
    sourceSha,
    workflowRunId: "123",
  });

  const result = await claimExecutionLock({
    token: "github-token",
    repository,
    sourceSha,
    lock,
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

  assert.equal(result.claimed, true);
  assert.deepEqual(
    calls.map(({ method }) => method),
    ["GET", "POST", "GET", "PUT"],
  );
  assert.doesNotMatch(JSON.stringify(calls), /github-token/);
});

test("refuses a second claim for the same draft", async () => {
  const lock = buildExecutionLock({
    authorization: authorization(),
    repository,
    sourceSha,
    workflowRunId: "123",
  });

  const result = await claimExecutionLock({
    token: "github-token",
    repository,
    sourceSha,
    lock,
    apiBaseUrl: "https://api.github.test",
    fetchImpl: async (url, options) => {
      if (String(url).includes("/git/ref/heads/")) {
        return json({}, 200);
      }
      assert.equal(options.method, "GET");
      return json(
        {
          content: Buffer.from(
            JSON.stringify(lock),
            "utf8",
          ).toString("base64"),
        },
        200,
      );
    },
  });

  assert.equal(result.claimed, false);
  assert.equal(result.reason, "already_claimed");
});

test("reads null when no execution lock exists", async () => {
  const result = await readExecutionLock({
    token: "github-token",
    repository,
    apiBaseUrl: "https://api.github.test",
    fetchImpl: async () => new Response("", { status: 404 }),
  });

  assert.equal(result, null);
});
