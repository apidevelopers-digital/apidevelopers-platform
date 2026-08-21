import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createOperationalGatewayWithReadonlyOperator } from "../src/operator-readonly-composition.mjs";

const AUTH_ENV_KEYS = [
  "API_GATEWAY_DELEGATED_KEY",
  "API_GATEWAY_DELEGATED_TENANT_ID",
  "API_GATEWAY_PROVISIONING_KEY",
];

function withCleanAuthEnv() {
  const previous = Object.fromEntries(
    AUTH_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
  for (const key of AUTH_ENV_KEYS)  delete process.env[key];
  return () => {
    for (const key of AUTH_ENV_KEYS) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  };
}

test("operational gateway mounts SaaS access route fail-closed", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-operational-saas-"));
  const stateFilePath = join(dir, "state.json");
  const restoreAuthEnv = withCleanAuthEnv();

  try {
    const gateway = createOperationalGatewayWithReadonlyOperator({
      stateFilePath,
    });

    assert.equal(typeof gateway.saasAccess.evaluateAccess, "function");
    assert.equal(typeof gateway.saasRuntime.getTenant, "function");

    const response = await gateway.app.handleRequest({
      method: "GET",
      url: "/v1/saas/access?accessGrantId=grant&workspaceId=workspace&productId=zuni",
      headers: {},
    });
    const body = JSON.parse(response.body);
    console.log("SAAS_OPERATIONAL_RESPONSE", JSON.stringify({ status: response.status, body }));

    assert.ok(
      response.status >= 400 && response.status < 500,
      `expected fail-closed 4xx, got ${response.status} ${JSON.stringify(body)}`,
    );
    assert.notEqual(response.status, 404);
    assert.notEqual(response.status, 503);
    assert.equal(body.allowed, false);
  } finally {
    restoreAuthEnv();
    await rm(dir, { recursive: true, force: true });
  }
});
