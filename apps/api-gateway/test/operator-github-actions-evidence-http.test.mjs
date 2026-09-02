import assert from "node:assert/strict";
import test from "node:test";

import {
  createGitHubActionsEvidenceHttpApp,
} from "../src/operator-github-actions-evidence-http.mjs";

function setup({
  decision = {
    decisionId: "dec_actions_001",
    effect: "allow",
    policyVersion: "v1",
  },
  auditFails = false,
} = {}) {
  const calls = {
    authz: [],
    audit: [],
    client: [],
    base: [],
  };
  const app = createGitHubActionsEvidenceHttpApp({
    app: {
      async handleRequest(request) {
        calls.base.push(request);
        return { status: 404, headers: {}, body: "{}" };
      },
    },
    authenticator: {
      async authenticate() {
        return {
          principal: {
            id: "igor",
            tenantId: "uni.operator",
          },
        };
      },
    },
    authorization: {
      async decide(input) {
        calls.authz.push(input);
        return decision;
      },
    },
    audit: {
      async recordOperatorCapabilityResult(input) {
        calls.audit.push(input);
        if (auditFails) throw new Error("audit offline");
        return { recorded: true };
      },
    },
    rateLimiter: {
      consume() {
        return { allowed: true, resetAt: Date.now() + 60_000 };
      },
    },
    client: {
      async getWorkflowRunEvidence(input) {
        calls.client.push(input);
        return Object.freeze({
          repository: "apidevelopers-digital/imuni",
          run: Object.freeze({
            id: 33523154986,
            name: "imuni Production HTTPS safe diagnostic",
            status: "completed",
            conclusion: "success",
            event: "workflow_dispatch",
            headSha: "0a638c77f7a67e8d6d8394a89f9232babb159ca6",
            branch: "main",
            runAttempt: 1,
            updatedAt: "2026-09-01T14:38:00.000Z",
          }),
          jobs: Object.freeze([
            Object.freeze({
              id: 456,
              name: "https-safe-diagnostic",
              status: "completed",
              conclusion: "success",
              checkRunId: 789,
              steps: Object.freeze([
                Object.freeze({
                  number: 1,
                  name: "Diagnose production HTTPS without writes",
                  status: "completed",
                  conclusion: "success",
                }),
              ]),
            }),
          ]),
          evidence: Object.freeze([
            Object.freeze({
              jobId: 456,
              jobName: "https-safe-diagnostic",
              checkRunId: 789,
              level: "notice",
              evidenceJson:
                '{"curlExit":0,"https2xxOr3xx":false,"httpsCode":"404","responseReceived":true}',
            }),
          ]),
        });
      },
    },
    organization: "apidevelopers-digital",
  });
  return { app, calls };
}

function request(extra = {}) {
  return {
    method: "POST",
    url: "/v1/operator/github/actions/evidence",
    headers: {
      authorization: "Bearer synthetic-operator-key",
    },
    body: {
      correlationId: "corr_actions_001",
      repository: "imuni",
      runId: 33523154986,
    },
    ...extra,
  };
}

test("returns sanitized GitHub Actions evidence only after authz and durable audit", async () => {
  const { app, calls } = setup();
  const response = await app.handleRequest(request());
  assert.equal(response.status, 200);
  const body = JSON.parse(response.body);

  assert.equal(body.repository, "apidevelopers-digital/imuni");
  assert.equal(body.run.id, 33523154986);
  assert.equal(body.evidence.length, 1);
  assert.equal(body.evidenceReturned, true);
  assert.equal(body.productionChanged, false);
  assert.equal(body.contentReturned, false);
  assert.equal(body.valuesReturned, false);

  assert.equal(calls.authz.length, 1);
  assert.equal(calls.authz[0].action, "operator.readonly.read");
  assert.equal(
    calls.authz[0].resource,
    "github:workflow_run_evidence:apidevelopers-digital/imuni:33523154986",
  );
  assert.deepEqual(calls.authz[0].requiredScopes, ["operator:resource:read"]);

  assert.equal(calls.client.length, 1);
  assert.deepEqual(calls.client[0], {
    owner: "apidevelopers-digital",
    repository: "imuni",
    runId: 33523154986,
    correlationId: "corr_actions_001",
    tenantId: "uni.operator",
  });

  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].outcome, "success");
  assert.equal(calls.audit[0].metadata.operationId, "operator.github.actions.evidence.read");
  assert.equal(calls.audit[0].metadata.evidenceCount, 1);
  assert.equal(calls.audit[0].metadata.productionChanged, false);

  const serialized = JSON.stringify(body);
  assert.equal(serialized.includes("synthetic-operator-key"), false);
  assert.equal(serialized.includes('"authorization":'), false);
});

test("denied authorization never calls GitHub and remains denied if audit succeeds", async () => {
  const { app, calls } = setup({
    decision: {
      decisionId: "dec_actions_deny",
      effect: "deny",
      policyVersion: "v1",
    },
  });
  const response = await app.handleRequest(request());
  assert.equal(response.status, 403);
  const body = JSON.parse(response.body);
  assert.equal(body.error, "forbidden");
  assert.equal(body.evidenceReturned, false);
  assert.equal(calls.client.length, 0);
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].outcome, "denied");
});

test("strict request schema rejects unsupported fields before authorization", async () => {
  const { app, calls } = setup();
  const response = await app.handleRequest(
    request({
      body: {
        correlationId: "corr_actions_002",
        repository: "imuni",
        runId: 33523154986,
        raw: true,
      },
    }),
  );
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, "invalid_github_actions_request");
  assert.equal(calls.authz.length, 0);
  assert.equal(calls.client.length, 0);
});

test("successful GitHub read is not returned when durable audit is unavailable", async () => {
  const { app, calls } = setup({ auditFails: true });
  const response = await app.handleRequest(request());
  assert.equal(response.status, 503);
  const body = JSON.parse(response.body);
  assert.equal(body.error, "audit_unavailable");
  assert.equal(body.evidenceReturned, false);
  assert.equal("evidence" in body, false);
  assert.equal(calls.client.length, 1);
  assert.equal(calls.audit.length, 1);
});

test("non-evidence routes pass through unchanged", async () => {
  const { app, calls } = setup();
  const response = await app.handleRequest({
    method: "GET",
    url: "/health",
  });
  assert.equal(response.status, 404);
  assert.equal(calls.base.length, 1);
});
