import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { startOperationalGatewayServer } from "../src/operational-http.mjs";

async function requestJson(baseUrl, path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  return { response, body };
}

test("serves the durable authentication lifecycle through real HTTP restarts", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "gateway-operational-http-"));
  const stateFilePath = join(directory, "state.json");
  const instances = [];

  t.after(async () => {
    for (const instance of instances.reverse()) {
      await instance.close();
    }
    await rm(directory, { recursive: true, force: true });
  });

  const first = await startOperationalGatewayServer({
    stateFilePath,
    port: 0,
    host: "127.0.0.1",
  });
  instances.push(first);

  const health = await requestJson(first.baseUrl, "/health");
  assert.equal(health.response.status, 200);
  assert.deepEqual(health.body, {
    service: "api-gateway",
    status: "ok",
  });

  const issued = await first.apiKeyLifecycle.issueApiKey({
    tenantId: "tenant_001",
    name: "Operational HTTP key",
    scopes: ["gateway:read"],
  });

  const persistedAfterIssue = await readFile(stateFilePath, "utf8");
  assert.equal(persistedAfterIssue.includes(issued.secret), false);

  const authenticated = await requestJson(first.baseUrl, "/v1/whoami", {
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": issued.secret,
    },
  });

  assert.equal(authenticated.response.status, 200);
  assert.equal(authenticated.body.identity.role, "client");
  assert.equal(authenticated.body.identity.principal.id, issued.apiKey.id);
  assert.equal(authenticated.body.identity.principal.tenantId, "tenant_001");
  assert.equal(JSON.stringify(authenticated.body).includes(issued.secret), false);
  assert.equal("hash" in authenticated.body.identity.principal, false);
  assert.equal("keyHash" in authenticated.body.identity.principal, false);

  const crossTenant = await requestJson(first.baseUrl, "/v1/whoami", {
    headers: {
      "x-tenant-id": "tenant_002",
      "x-api-key": issued.secret,
    },
  });
  assert.equal(crossTenant.response.status, 401);
  assert.deepEqual(crossTenant.body, { error: "unauthorized" });

  await first.close();

  const second = await startOperationalGatewayServer({
    stateFilePath,
    port: 0,
    host: "127.0.0.1",
  });
  instances.push(second);

  const authenticatedAfterRestart = await requestJson(second.baseUrl, "/v1/whoami", {
    headers: {
      "x-tenant-id": "tenant_001",
      authorization: `Bearer ${issued.secret}`,
    },
  });
  assert.equal(authenticatedAfterRestart.response.status, 200);

  await second.apiKeyLifecycle.revokeApiKey({
    tenantId: "tenant_001",
    apiKeyId: issued.apiKey.id,
    reason: "test_completed",
  });

  await second.close();

  const third = await startOperationalGatewayServer({
    stateFilePath,
    port: 0,
    host: "127.0.0.1",
  });
  instances.push(third);

  const rejectedAfterRestart = await requestJson(third.baseUrl, "/v1/whoami", {
    headers: {
      "x-tenant-id": "tenant_001",
      "x-api-key": issued.secret,
    },
  });

  assert.equal(rejectedAfterRestart.response.status, 401);
  assert.deepEqual(rejectedAfterRestart.body, { error: "unauthorized" });

  const healthAfterRestart = await requestJson(third.baseUrl, "/health");
  assert.equal(healthAfterRestart.response.status, 200);
});
