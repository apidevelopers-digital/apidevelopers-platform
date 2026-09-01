import assert from "node:assert/strict";
import test from "node:test";

import { createGitHubActionsEvidenceClient } from "../src/operator-github-actions-evidence-client.mjs";

const token = Buffer.from("synthetic-actions-readonly-token");

function provider() {
  return {
    async withSecret(_access, consumer) {
      return consumer({ bytes: token, version: "v1" });
    },
  };
}

function makeClient(responses, calls = []) {
  return createGitHubActionsEvidenceClient({
    secretProvider: provider(),
    credentialRef: "vault://github/operator-readonly",
    transport: {
      async requestWithCredential(input) {
        calls.push(input);
        return responses.shift();
      },
    },
  });
}

test("collects workflow run, jobs and ADA_EVIDENCE annotations without raw secrets", async () => {
  const calls = [];
  const client = makeClient([
    {
      status: 200,
      body: {
        id: 33523154986,
        name: "imuni Production HTTPS safe diagnostic",
        status: "completed",
        conclusion: "success",
        event: "workflow_dispatch",
        head_sha: "0a638c77f7a67e8d6d8394a89f9232babb159ca6",
        head_branch: "main",
        run_attempt: 1,
        updated_at: "2026-09-01T14:38:00Z",
        repository: { full_name: "apidevelopers-digital/imuni" },
        token: "never-leak",
      },
    },
    {
      status: 200,
      body: {
        jobs: [{
          id: 101,
          name: "https-safe-diagnostic",
          status: "completed",
          conclusion: "success",
          check_run_url: "https://api.github.com/repos/apidevelopers-digital/imuni/check-runs/456",
          runner_name: "igor-mac-runner",
          steps: [{
            number: 1,
            name: "Diagnose production HTTPS without writes",
            status: "completed",
            conclusion: "success",
          }],
        }],
      },
    },
    {
      status: 200,
      body: [{
        title: "ADA_EVIDENCE",
        annotation_level: "notice",
        message: '{"curlExit":0,"httpsCode":"404","responseReceived":true,"https2xxOr3xx":false}',
        raw_details: "ignored",
      }],
    },
  ], calls);

  const value = await client.getWorkflowRunEvidence({
    owner: "apidevelopers-digital",
    repository: "imuni",
    runId: 33523154986,
    correlationId: "corr_actions_001",
    tenantId: "uni.operator",
  });

  assert.equal(value.repository, "apidevelopers-digital/imuni");
  assert.equal(value.run.id, 33523154986);
  assert.equal(value.jobs[0].checkRunId, 456);
  assert.equal("runner_name" in value.jobs[0], false);
  assert.equal(value.evidence.length, 1);
  assert.equal(
    value.evidence[0].evidenceJson,
    '{"curlExit":0,"https2xxOr3xx":false,"httpsCode":"404","responseReceived":true}',
  );

  assert.equal(calls.length, 3);
  assert.match(calls[0].request.url, /\/actions\/runs\/33523154986$/);
  assert.match(calls[1].request.url, /\/actions\/runs\/33523154986\/jobs\?per_page=100$/);
  assert.match(calls[2].request.url, /\/check-runs\/456\/annotations\?per_page=100$/);

  for (const call of calls) {
    assert.equal(call.request.method, "GET");
    assert.equal(
      Object.keys(call.request.headers).some((key) => key.toLowerCase() === "authorization"),
      false,
    );
    assert.equal(call.credential.scheme, "bearer");
    assert.ok(call.credential.bytes instanceof Uint8Array);
  }

  assert.equal(JSON.stringify(value).includes("never-leak"), false);
  assert.equal(JSON.stringify(value).includes("synthetic-actions-readonly-token"), false);
});

test("sanitizes non-success GitHub responses without leaking response body", async () => {
  const client = makeClient([{
    status: 403,
    body: { message: "secret provider detail must not escape", token: "never" },
  }]);

  await assert.rejects(
    client.getWorkflowRunEvidence({
      owner: "apidevelopers-digital",
      repository: "imuni",
      runId: 33523154986,
    }),
    (error) =>
      error.code === "github_actions_request_failed" &&
      error.status === 403 &&
      !error.message.include("secret provider detail") &&
      !error.message.includes("never"),
   );
});
