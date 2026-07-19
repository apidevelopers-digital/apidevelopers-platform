import assert from "node:assert/strict";
import test from "node:test";

import { getOpenApiDocument } from "../src/openapi.mjs";

const expectedScopes = new Map([
  ["GET /v1/admin/status", "admin:status:read"],
  ["GET /v1/admin/audit", "admin:audit:read"],
  ["GET /v1/admin/clients", "admin:clients:read"],
  ["POST /v1/admin/clients", "admin:clients:write"],
  ["GET /v1/admin/clients/{clientId}", "admin:clients:read"],
  ["PATCH /v1/admin/clients/{clientId}", "admin:clients:write"],
  ["POST /v1/admin/clients/{clientId}/keys", "admin:keys:write"],
  ["DELETE /v1/admin/clients/{clientId}/keys/{keyId}", "admin:keys:write"],
]);

test("documents version 0.3.0 and explicit administrative scopes", () => {
  const document = getOpenApiDocument();

  assert.equal(document.info.version, "0.3.0");

  for (const [operation, scope] of expectedScopes) {
    const [method, path] = operation.split(" ");
    const contract = document.paths[path][method.toLowerCase()];

    assert.deepEqual(contract["x-required-scopes"], [scope]);
    assert.ok(contract.responses[403]);
  }
});

test("returns an isolated OpenAPI document clone", () => {
  const first = getOpenApiDocument();
  first.info.version = "mutated";
  first.paths["/v1/admin/status"].get["x-required-scopes"].push("invalid");

  const second = getOpenApiDocument();

  assert.equal(second.info.version, "0.3.0");
  assert.deepEqual(second.paths["/v1/admin/status"].get["x-required-scopes"], [
    "admin:status:read",
  ]);
});
