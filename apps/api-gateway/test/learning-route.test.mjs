import assert from "node:assert/strict";
import test from "node:test";

import {
  createLearningRoute,
  withLearningRoute,
} from "../src/learning-route.mjs";

function parse(result) {
  return JSON.parse(result.body);
}

test("serves the learning screen only with the administrative key", async () => {
  const route = createLearningRoute({
    adminKey: "admin-test-key",
    getLearningScreen: () => ({
      screenId: "portal.learning",
      readOnly: true,
      summary: { memories: 2, findings: 1, proposals: 1 },
    }),
  });

  const denied = await route.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: {},
  });
  const allowed = await route.handleRequest({
    method: "GET",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "admin-test-key" },
  });

  assert.equal(denied.status, 401);
  assert.equal(parse(denied).error, "unauthorized");
  assert.equal(allowed.status, 200);
  assert.equal(parse(allowed).data.screenId, "portal.learning");
  assert.equal(parse(allowed).meta.readOnly, true);
  assert.equal(parse(allowed).meta.mutationAllowed, false);
  assert.equal(parse(allowed).meta.executionAllowed, false);
});

test("does not handle methods or paths outside the learning route", async () => {
  const route = createLearningRoute({
    adminKey: "admin-test-key",
    getLearningScreen: () => ({}),
  });

  assert.equal(await route.handleRequest({
    method: "POST",
    url: "/v1/admin/learning",
    headers: { "x-api-key": "admin-test-key" },
  }), null);

  assert.equal(await route.handleRequest({
    method: "GET",
    url: "/v1/admin/clients",
    headers: { "x-api-key": "admin-test-key" },
  }), null);
});

test("delegates every unrelated request to the existing gateway app", async () => {
  const delegated = [];
  const app = {
    async handleRequest(request) {
      delegated.push(request.url);
      return { status: 204, headers: {}, body: "" };
    },
  };
  const wrapped = withLearningRoute({
    app,
    adminKey: "admin-test-key",
    getLearningScreen: () => ({ screenId: "portal.learning" }),
  });

  const response = await wrapped.handleRequest({
    method: "GET",
    url: "/health",
    headers: {},
  });

  assert.equal(response.status, 204);
  assert.deepEqual(delegated, ["/health"]);
});
