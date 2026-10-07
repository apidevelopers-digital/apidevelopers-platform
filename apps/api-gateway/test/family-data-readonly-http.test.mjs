import assert from "node:assert/strict";
import test from "node:test";

import { createFamilyDataReadonlyHttpApp } from "../src/family-data-readonly-http.mjs";

function identity(scopes, tenantId = "homosapiens-id") {
  return {
    principal: {
      id: "svc_mcp_brain",
      tenantId,
      kind: "service",
      scopes
    }
  };
}

function fixture({ scopes = [], tenantId = "homosapiens-id" } = {}) {
  const calls = [];
  const store = Object.fromEntries(
    ["purchaseList", "purchaseGet", "productStats", "productPriceHistory", "chefContext", "evidenceGet"]
      .map((name) => [name, async (args) => {
        calls.push({ name, args });
        if (name === "purchaseGet") {
          return { request_id: args.request_id, data: { purchase: { purchase_id: args.purchase_id } } };
        }
        if (name === "evidenceGet") {
          return { request_id: args.request_id, data: { evidence: { evidence_id: args.evidence_id } } };
        }
        return { request_id: args.request_id, data: {} };
      }])
  );

  const app = {
    async handleRequest(request) {
      return { status: 299, headers: {}, body: JSON.stringify({ delegated: request.url }) };
    }
  };

  const authenticator = {
    async authenticate() {
      return identity(scopes, tenantId);
    }
  };

  const authorization = {
    decide({ identity: current, requiredScopes }) {
      const have = new Set(current.principal.scopes ?? []);
      const missing = requiredScopes.filter((scope) => !have.has(scope));
      return missing.length
        ? { effect: "deny", reasonCodes: missing.map((scope) => `missing_scope:${scope}`) }
        : { effect: "allow", reasonCodes: [] };
    }
  };

  return {
    calls,
    http: createFamilyDataReadonlyHttpApp({
      app,
      authenticator,
      authorization,
      store,
      requestIdFactory: () => "req_generated"
    })
  };
}

test("purchase list maps GET query to the scoped read store", async () => {
  const { http, calls } = fixture({ scopes: ["family:purchases:read"] });
  const response = await http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases?date_from=2026-01-01&limit=25",
    headers: { "x-request-id": "req_1" }
  });
  assert.equal(response.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "purchaseList");
  assert.deepEqual(calls[0].args, {
    tenant_id: "homosapiens-id",
    request_id: "req_1",
    date_from: "2026-01-01",
    date_to: undefined,
    merchant_id: undefined,
    status: undefined,
    limit: 25
  });
});

test("purchase get requires finance scope while payments are included", async () => {
  const denied = fixture({ scopes: ["family:purchases:read"] });
  const deniedResponse = await denied.http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases/pur_1"
  });
  assert.equal(deniedResponse.status, 403);
  assert.equal(denied.calls.length, 0);

  const allowed = fixture({ scopes: ["family:purchases:read", "family:finance:read"] });
  const allowedResponse = await allowed.http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases/pur_1",
    headers: { "x-correlation-id": "req_2" }
  });
  assert.equal(allowedResponse.status, 200);
  assert.equal(allowed.calls[0].args.purchase_id, "pur_1");
  assert.equal(allowed.calls[0].args.include_payment, true);
});

test("purchase get can omit payments without requiring finance scope", async () => {
  const { http, calls } = fixture({ scopes: ["family:purchases:read"] });
  const response = await http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases/pur_1?include_payment=false"
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0].args.include_payment, false);
});

test("product price history requires product and finance scopes", async () => {
  const { http, calls } = fixture({ scopes: ["family:products:read", "family:finance:read"] });
  const response = await http.handleRequest({
    method: "GET",
    url: "/v1/family/products/prd_1/price-history?limit=20"
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0].name, "productPriceHistory");
  assert.equal(calls[0].args.limit, 20);
});

test("evidence content mode is blocked before store execution", async () => {
  const { http, calls } = fixture({ scopes: ["family:evidence:read"] });
  const response = await http.handleRequest({
    method: "GET",
    url: "/v1/family/evidence/ev_1?mode=content"
  });
  assert.equal(response.status, 403);
  assert.equal(JSON.parse(response.body).error, "evidence_content_forbidden");
  assert.equal(calls.length, 0);
});

test("unknown query input and non-GET methods are rejected", async () => {
  const { http, calls } = fixture({ scopes: ["family:purchases:read"] });
  const badQuery = await http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases?url=https://evil.invalid"
  });
  assert.equal(badQuery.status, 400);

  const post = await http.handleRequest({
    method: "POST",
    url: "/v1/family/purchases"
  });
  assert.equal(post.status, 405);
  assert.equal(post.headers.allow, "GET");
  assert.equal(calls.length, 0);
});

test("encoded path traversal ids are rejected before auth or store execution", async () => {
  const { http, calls } = fixture({ scopes: ["family:purchases:read", "family:finance:read"] });
  const response = await http.handleRequest({
    method: "GET",
    url: "/v1/family/purchases/..%2Fsecret"
  });
  assert.equal(response.status, 400);
  assert.equal(JSON.parse(response.body).error, "invalid_family_data_request");
  assert.equal(calls.length, 0);
});

test("unmatched routes delegate to the underlying gateway app", async () => {
  const { http } = fixture();
  const response = await http.handleRequest({ method: "GET", url: "/health" });
  assert.equal(response.status, 299);
});
