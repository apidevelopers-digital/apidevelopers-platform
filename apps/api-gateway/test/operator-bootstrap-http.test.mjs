import assert from "node:assert/strict";
import test from "node:test";

import {
  OPERATOR_BOOTSTRAP_CONFIRMATION,
  createOperatorBootstrapHttpApp,
} from "../src/operator-bootstrap-http.mjs";

function baseApp() {
  return Object.freeze({
    async handleRequest() {
      return {
        status: 404,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: "not_found" }),
      };
    },
  });
}

function createHarness() {
  const records = [];
  const audits = [];
  const repository = {
    async create(record) {
      records.push(structuredClone(record));
      return structuredClone(record);
    },
    async getActiveByPrefix(tenantId, prefix) {
      return (
        records.find(
          (record) =>
            record.tenantId === tenantId &&
            record.prefix === prefix &&
            record.status === "active",
        ) ?? null
      );
    },
  };
  const authenticator = {
    async authenticate(headers) {
      if (headers["x-api-key"] !== "admin-secret") return null;
      return Object.freeze({
        role: "admin",
        principal: Object.freeze({
          id: "admin",
          scopes: Object.freeze(["admin:*"]),
        }),
      });
    },
  };
  const authorization = {
    decide({ identity, requiredScopes }) {
      const scopes = identity?.principal?.scopes ?? [];
      const allowed = requiredScopes.every((scope) => scopes.includes(scope));
      return Object.freeze({
        effect: allowed ? "allow" : "deny",
        decisionId: "decision-operator-bootstrap",
        policyVersion: "test",
      });
    },
  };
  const audit = {
    async recordOperatorCapabilityResult(event) {
      audits.push(structuredClone(event));
      return event;
    },
  };
  const app = createOperatorBootstrapHttpApp({
    app: baseApp(),
    authenticator,
    authorization,
    apiKeyRepository: repository,
    audit,
    idFactory: () => "operator-key-001",
    now: () => "2026-09-02T22:00:00.000Z",
  });
  return { app, records, audits };
}

function request({
  key = "operator-key-material-abcdefghijklmnopqrstuvwxyz123456",
  tenantId = "component.tenant.apidevelopers-digital",
  confirmation = OPERATOR_BOOTSTRAP_CONFIRMATION,
  adminKey = "admin-secret",
} = {}) {
  return {
    method: "POST",
    url: "/v1/operator/bootstrap",
    headers: {
      "x-api-key": adminKey,
      "x-operation-confirmation": confirmation,
      "x-correlation-id": "corr-operator-bootstrap",
    },
    body: JSON.stringify({
      tenantId,
      operatorKey: key,
      correlationId: "corr-operator-bootstrap",
    }),
  };
}

test("operator bootstrap requires authenticated admin wildcard", async () => {
  const { app, records } = createHarness();
  const response = await app.handleRequest(request({ adminKey: "wrong" }));
  assert.equal(response.status, 401);
  assert.equal(records.length, 0);
});

test("operator bootstrap requires explicit confirmation", async () => {
  const { app, records } = createHarness();
  const response = await app.handleRequest(request({ confirmation: "NO" }));
  const body = JSON.parse(response.body);
  assert.equal(response.status, 428);
  assert.equal(body.requiredConfirmation, OPERATOR_BOOTSTRAP_CONFIRMATION);
  assert.equal(records.length, 0);
});

test("operator bootstrap stores only hash and fixed operator scope", async () => {
  const { app, records, audits } = createHarness();
  const operatorKey =
    "operator-key-material-abcdefghijklmnopqrstuvwxyz123456";
  const response = await app.handleRequest(request({ key: operatorKey }));
  const body = JSON.parse(response.body);

  assert.equal(response.status, 201);
  assert.equal(records.length, 1);
  assert.equal(records[0].tenantId, "component.tenant.apidevelopers-digital");
  assert.deepEqual(records[0].scopes, ["operator:resource:read"]);
  assert.equal(records[0].name, "Institutional Operator");
  assert.equal(records[0].hash.length, 64);
  assert.notEqual(records[0].hash, operatorKey);
  assert.equal(body.secretReturned, false);
  assert.equal(body.secretStoredAsHash, true);
  assert.equal(body.productionChanged, true);
  assert.equal(JSON.stringify(body).includes(operatorKey), false);
  assert.equal(audits.length, 1);
  assert.equal(JSON.stringify(audits).includes(operatorKey), false);
});

test("operator bootstrap is idempotent for the same tenant and secret", async () => {
  const { app, records, audits } = createHarness();
  const first = await app.handleRequest(request());
  const second = await app.handleRequest(request());
  const body = JSON.parse(second.body);

  assert.equal(first.status, 201);
  assert.equal(second.status, 200);
  assert.equal(records.length, 1);
  assert.equal(body.idempotent, true);
  assert.equal(body.productionChanged, false);
  assert.equal(audits.length, 2);
});

test("operator bootstrap rejects non-canonical tenant ids", async () => {
  const { app, records } = createHarness();
  const response = await app.handleRequest(
    request({ tenantId: "tenant_institutional_operator" }),
  );
  assert.equal(response.status, 400);
  assert.equal(records.length, 0);
});
