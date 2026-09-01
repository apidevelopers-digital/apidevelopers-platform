import assert from "node:assert/strict";
import test from "node:test";
import {
  buildGitHubActionsPaths,
  GitHubActionsEvidenceError,
  sanitizeAdaEvidenceAnnotations,
  sanitizeWorkflowJobs,
  sanitizeWorkflowRun,
} from "../src/operator-github-actions-evidence-contract.mjs";

const run = {
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
  token: "must-not-leak",
};

test("workflow run projection strips raw GitHub fields", () => {
  const value = sanitizeWorkflowRun(run, {
    owner: "apidevelopers-digital", repository: "imuni", runId: 33523154986,
  });
  assert.equal(value.id, 33523154986);
  assert.equal(value.headSha, "0a638c77f7a67e8d6d8394a89f9232babb159ca6");
  assert.equal("token" in value, false);
});

test("job projection strips runner details and validates check run URL", () => {
  const jobs = sanitizeWorkflowJobs({
    jobs: [{
      id: 123,
      name: "https-safe-diagnostic",
      status: "completed",
      conclusion: "success",
      check_run_url: "https://api.github.com/repos/apidevelopers-digital/imuni/check-runs/456",
      runner_name: "igor-mac-runner",
      steps: [{ number: 1, name: "Diagnose HTTPS", status: "completed", conclusion: "success" }],
    }],
  });
  assert.equal(jobs[0].checkRunId, 456);
  assert.equal("runner_name" in jobs[0], false);

  assert.throws(
    () => sanitizeWorkflowJobs({ jobs: [{
      id: 123, name: "x", status: "completed", conclusion: "success",
      check_run_url: "https://evil.example/check-runs/456", steps: [],
    }]}),
    (error) => error instanceof GitHubActionsEvidenceError &&
      error.code === "github_actions_contract_violation",
  );
});

test("ADA_EVIDENCE accepts bounded primitives and rejects sensitive or nested data", () => {
  const job = { id: 123, name: "diag", checkRunId: 456 };
  const items = sanitizeAdaEvidenceAnnotations([
    {
      title: "ADA_EVIDENCE",
      annotation_level: "notice",
      message: '{"curlExit":0,"httpsCode":"404","responseReceived":true,"https2xxOr3xx":false}',
      raw_details: "ignored",
    },
    { title: "other", annotation_level: "warning", message: "ignored" },
  ], job);

  assert.equal(items.length, 1);
  assert.equal(
    items[0].evidenceJson,
    '{"curlExit":0,"https2xxOr3xx":false,"httpsCode":"404","responseReceived":true}',
  );

  assert.throws(
    () => sanitizeAdaEvidenceAnnotations([{
      title: "ADA_EVIDENCE", annotation_level: "notice",
      message: '{"token":"never"}',
    }], job),
    (error) => error instanceof GitHubActionsEvidenceError &&
      error.code === "github_actions_evidence_invalid",
  );

  assert.throws(
    () => sanitizeAdaEvidenceAnnotations([{
      title: "ADA_EVIDENCE", annotation_level: "notice",
      message: '{"details":{"nested":true}}',
    }], job),
    (error) => error instanceof GitHubActionsEvidenceError &&
      error.code === "github_actions_evidence_invalid",
  );
});

test("GitHub Actions paths are derived locally from validated identifiers", () => {
  const paths = buildGitHubActionsPaths({
    owner: "apidevelopers-digital", repository: "imuni", runId: 33523154986, checkRunId: 456,
  });
  assert.equal(paths.run, "/repos/apidevelopers-digital/imuni/actions/runs/33523154986");
  assert.equal(paths.jobs, "/repos/apidevelopers-digital/imuni/actions/runs/33523154986/jobs?per_page=100");
  assert.equal(paths.annotations, "/repos/apidevelopers-digital/imuni/check-runs/456/annotations?per_page=100");
});
