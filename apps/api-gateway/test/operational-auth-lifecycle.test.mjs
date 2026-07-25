import assert from "node:assert/strict";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createOperationalGateway } from "../src/operational-composition.mjs";

test("persists the API key lifecycle across gateway restarts without storing the secret", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-auth-lifecycle-"));
  const stateFilePath = join(directory, "state.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const first = createOperationalGateway({ stateFilePath });
  const issued = await first.apiKeyLifecycle.issueApiKey({
    tenantId: "tenant_001",
    name: "Operational key",
    scopes: ["gateway:read"],
  });

  const persistedAfterIssue = await readFile(stateFilePath, "utf8");
  assert.equal(persistedAfterIssue.includes(issued.secret), false);

  const second = createOperationalGateway({ stateFilePath });
  const authenticated = await second.app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": issued.secret,
    },
  });

  assert.equal(authenticated.status, 200);
  const authenticatedBody = JSON.parse(authenticated.body);
  assert.equal(authenticatedBody.identity.role, "client");
  assert.equal(authenticatedBody.identity.principal.id, issued.apiKey.id);
  assert.equal(authenticatedBody.identity.principal.tenantId, "tenant_001");
  assert.equal(authenticated.body.includes(issued.secret), false);
  assert.equal(authenticated.body.includes("keyHash"), false);
  assert.equal(authenticated.body.includes('"hash"'), false);

  const crossTenant = await second.app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-tenant-id": "tenant_002",
      "x-api-key": issued.secret,
    },
  });
  assert.equal(crossTenant.status, 401);

  await second.apiKeyLifecycle.revokeApiKey({
    tenantId: "tenant_001",
    apiKeyId: issued.apiKey.id,
    reason: "test_completed",
  });

  const persistedAfterRevocation = await readFile(stateFilePath, "utf8");
  assert.equal(persistedAfterRevocation.includes(issued.secret), false);

  const third = createOperationalGateway({ stateFilePath });
  const rejected = await third.app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": issued.secret,
    },
  });

  assert.equal(rejected.status, 401);
  assert.deepEqual(JSON.parse(rejected.body), { error: "unauthorized" });
});

test("requires an explicit persistence path", () => {
  assert.throws(
    () => createOperationalGateway(),
    /stateFilePath is required/,
  );
});
