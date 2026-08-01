import assert from "node:assert/strict";
import test from "node:test";

import {
  HostingerStructureInventoryError,
} from "../src/operator-hostinger-structure-inventory.mjs";
import {
  createHostingerStructureInventoryHttpApp,
} from "../src/operator-hostinger-structure-http.mjs";

const BASE_BODY = Object.freeze({
  correlationId: "corr_20260801_001",
  host: "sitedauni.com",
  mode: "metadata-only",
  includeContent: false,
  paths: ["includes"],
  extensions: ["php"],
});

function identity({
  id = "operator-igor",
  tenantId = "uni.",
  scopes = ["operator:hostinger:structure:read"],
} = {}) {
  return {
    role: "operator",
    principal: { id, tenantId, scopes },
  };
}

function createFixture({
  authenticatedIdentity = identity(),
  decisionEffect = "allow",
  inventoryImpl,
  auditImpl,
} = {}) {
  const calls = {
    inventory: [],
    audit: [],
    delegated: [],
  };

  const app = createHostingerStructureInventoryHttpApp({
    app: {
      async handleRequest(request) {
        calls.delegated.push(request);
        return {
          status: 404,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ error: "not_found" }),
        };
      },
    },
    authenticator: {
      async authenticate() {
        return authenticatedIdentity;
      },
    },
    authorization: {
      decide({ identity: currentIdentity, action, resource, requiredScopes }) {
        const missing = requiredScopes.filter(
          (scope) => !currentIdentity.principal.scopes.includes(scope),
        );
        return {
          decisionId: "decision-001",
          effect: missing.length === 0 ? decisionEffect : "deny",
          policyVersion: "gateway-authz-v1",
          action,
          resource,
        };
      },
    },
    inventory: {
      async inventory(input) {
        calls.inventory.push(input);
        if (inventoryImpl) return inventoryImpl(input);
        throw new HostingerStructureInventoryError(
          "adapter_unavailable",
          "adapter unavailable",
        );
      },
    },
    audit: {
      async recordOperatorCapabilityResult(event) {
        calls.audit.push(event);
        if (auditImpl) return auditImpl(event);
        return { eventId: "audit-001" };
      },
    },
  });

  return { app, calls };
}

async function request(app, body = BASE_BODY, overrides = {}) {
  return app.handleRequest({
    method: "POST",
    url: "/v1/operator/hostinger/structure/inventory",
    headers: {},
    body: JSON.stringify(body),
    ...overrides,
  });
}

test("delegates unrelated routes", async () => {
  const { app, calls } = createFixture();
  const response = await app.handleRequest({ method: "GET", url: "/health" });

  assert.equal(response.status, 404);
  assert.equal(calls.delegated.length, 1);
  assert.equal(calls.inventory.length, 0);
});

test("rejects unauthenticated requests before inventory", async () => {
  const { app, calls } = createFixture({ authenticatedIdentity: null });
  const response = await request(app);

  assert.equal(response.status, 401);
  assert.equal(JSON.parse(response.body).contentReturned, false);
  assert.equal(calls.inventory.length, 0);
});

test("denies missing tenant context and missing scope", async () => {
  const noTenant = createFixture({
    authenticatedIdentity: identity({ tenantId: "" }),
  });
  const noTenantResponse = await request(noTenant.app);
  assert.equal(noTenantResponse.status, 403);
  assert.equal(noTenant.calls.inventory.length, 0);

  const noScope = createFixture({
    authenticatedIdentity: identity({ scopes: [] }),
  });
  const noScopeResponse = await request(noScope.app);
  assert.equal(noScopeResponse.status, 403);
  assert.equal(noScope.calls.inventory.length, 0);
  assert.equal(noScope.calls.audit[0].outcome, "denied");
  assert.equal(noScope.calls.audit[0].metadata.pathCount, 1);
});

test("default null adapter returns sanitized 503 and records failure", async () => {
  const { app, calls } = createFixture();
  const response = await request(app);
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 503);
  assert.deepEqual(payload, {
    error: "adapter_unavailable",
    correlationId: "corr_20260801_001",
    productionChanged: false,
    contentReturned: false,
  });
  assert.equal(calls.inventory.length, 1);
  assert.deepEqual(calls.inventory[0], {
    institution: "API Developers.digital",
    tenant: "uni.",
    operator: "operator-igor",
    correlationId: "corr_20260801_001",
    host: "sitedauni.com",
    mode: "metadata-only",
    includeContent: false,
    paths: ["includes"],
    extensions: ["php"],
  });
  assert.equal(calls.audit[0].outcome, "failure");
  assert.equal(calls.audit[0].metadata.errorCode, "adapter_unavailable");
  assert.equal("paths" in calls.audit[0].metadata, false);
});

test("returns sanitized metadata only after successful audit", async () => {
  const result = Object.freeze({
    operationId: "operatorHostingerStructureInventory",
    institution: "API Developers.digital",
    tenant: "uni.",
    operator: "operator-igor",
    correlationId: "corr_20260801_001",
    host: "sitedauni.com",
    mode: "metadata-only",
    generatedAt: "2026-08-01T20:30:00.000Z",
    productionChanged: false,
    contentReturned: false,
    count: 1,
    items: [
      {
        path: "includes/api.php",
        extension: "php",
        sizeBytes: 128,
        modifiedAt: "2026-08-01T20:00:00.000Z",
        mime: "text/x-php",
        sha256: "a".repeat(64),
      },
    ],
    blocked: [],
  });

  const { app, calls } = createFixture({
    inventoryImpl: async () => result,
  });
  const response = await request(app);
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 200);
  assert.equal(payload.productionChanged, false);
  assert.equal(payload.contentReturned, false);
  assert.equal(payload.items.length, 1);
  assert.equal(calls.audit[0].outcome, "success");
  assert.equal(calls.audit[0].metadata.itemCount, 1);
});

test("fails closed when success cannot be audited", async () => {
  const { app } = createFixture({
    inventoryImpl: async () => ({
      count: 0,
      blocked: [],
      productionChanged: false,
      contentReturned: false,
    }),
    auditImpl: async () => {
      throw new Error("audit unavailable");
    },
  });

  const response = await request(app);
  const payload = JSON.parse(response.body);

  assert.equal(response.status, 503);
  assert.equal(payload.error, "audit_unavailable");
  assert.equal(payload.contentReturned, false);
});

test("rejects malformed JSON and non-POST methods", async () => {
  const { app, calls } = createFixture();

  const malformed = await request(app, BASE_BODY, { body: "{" });
  assert.equal(malformed.status, 400);
  assert.equal(calls.inventory.length, 0);

  const method = await request(app, BASE_BODY, { method: "GET" });
  assert.equal(method.status, 405);
  assert.equal(method.headers.allow, "POST");
});
