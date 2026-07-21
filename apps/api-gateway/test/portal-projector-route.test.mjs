import test from "node:test";
import assert from "node:assert/strict";

import {
  createPortalProjectorGatewayRoute,
  withPortalProjectorRoute,
} from "../src/portal-projector-route.mjs";

const COMMIT = "a".repeat(40);

function fixture({
  scopes = ["portal:summary:read"],
  rateDecision = { allowed: true },
} = {}) {
  const readApi = Object.freeze({
    mutationAllowed: false,
    getSnapshot() { return { sourceCommit: COMMIT, contentChecksum: "c".repeat(64) }; },
    getSummary() { return { sourceCommit: COMMIT, contentChecksum: "c".repeat(64) }; },
    listRecords() { return { items: [], page: { offset: 0, limit: 50, total: 0, hasMore: false } }; },
    getRecord() { return null; },
    listVersions() { return { items: [], page: { offset: 0, limit: 50, total: 0, hasMore: false } }; },
  });

  const apiKeyManager = {
    resolveByRawKey(rawKey) {
      if (rawKey !== "valid-key") return null;
      return { id: "client-1", status: "active", scopes };
    },
  };

  const rateLimiter = {
    check() { return rateDecision; },
  };

  return {
    route: createPortalProjectorGatewayRoute({
      readApi,
      apiKeyManager,
      rateLimiter,
    }),
    readApi,
    apiKeyManager,
    rateLimiter,
  };
}

test("returns null outside portal base path", async () => {
  const { route } = fixture();
  assert.equal(await route.handleRequest({ method: "GET", url: "/v1/other" }), null);
});

test("authenticates API keys through auth-core", async () => {
  const { route } = fixture();
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: { "x-api-key": "valid-key" },
  });
  assert.equal(response.status, 200);
  assert.equal(typeof response.body, "string");
});

test("returns 401 for missing credentials", async () => {
  const { route } = fixture();
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: {},
  });
  assert.equal(response.status, 401);
});

test("enforces portal scopes", async () => {
  const { route } = fixture({ scopes: [] });
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: { authorization: "Bearer valid-key" },
  });
  assert.equal(response.status, 403);
});

test("applies rate limiting before authentication", async () => {
  const { route } = fixture({
    rateDecision: { allowed: false, retryAfterSeconds: 7 },
  });
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: {},
    remoteAddress: "127.0.0.1",
  });
  assert.equal(response.status, 429);
  assert.equal(response.headers["retry-after"], "7");
});

test("serializes adapter bodies for gateway server", async () => {
  const { route } = fixture();
  const response = await route.handleRequest({
    method: "GET",
    url: "/v1/portal/summary",
    headers: { "x-api-key": "valid-key" },
  });
  assert.deepEqual(JSON.parse(response.body).data.sourceCommit, COMMIT);
});

test("wrapper falls back to base app", async () => {
  const { readApi, apiKeyManager, rateLimiter } = fixture();
  const wrapped = withPortalProjectorRoute({
    app: { async handleRequest() { return { status: 204, headers: {}, body: "" }; } },
    readApi,
    apiKeyManager,
    rateLimiter,
  });
  const response = await wrapped.handleRequest({ method: "GET", url: "/health" });
  assert.equal(response.status, 204);
});

test("does not expose mutation", () => {
  const { route } = fixture();
  assert.equal(route.mutationAllowed, false);
  assert.equal("publish" in route, false);
});
