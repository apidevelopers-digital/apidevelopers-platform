import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  TRUST_PRODUCT_ID,
  TRUST_SANDBOX_PROVISIONING_CONTRACT,
  TRUST_SANDBOX_SCOPES,
} from "@apidevelopers/contracts";

import { createOperationalGatewayWithReadonlyOperator } from "../src/operator-readonly-composition.mjs";

const NOW = "2026-08-21T00:50:00.000Z";
const PROVISIONING_KEY = "trust-m2-provisioning-key-20260821-0001";
const ISSUED_SECRET = "trust_sk_test_20260821_abcdefghijklmnopqrstu";

test("Trust M2 operational gateway provisions one-time sandbox credential and authenticates tenant-scoped whoami", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-m2-operational-"));
  const stateFilePath = join(directory, "state.json");
  t.after(() => rm(directory, { recursive: true, force: true }));

  const previousProvisioningKey = process.env.API_GATEWAY_PROVISIONING_KEY;
  process.env.API_GATEWAY_PROVISIONING_KEY = PROVISIONING_KEY;
  t.after(() => {
    if (previousProvisioningKey === undefined) {
      delete process.env.API_GATEWAY_PROVISIONING_KEY;
    } else {
      process.env.API_GATEWAY_PROVISIONING_KEY = previousProvisioningKey;
    }
  });

  let apiKeySequence = 0;
  const gateway = createOperationalGatewayWithReadonlyOperator({
    stateFilePath,
    clock: () => NOW,
    writeIdFactory: () => "trust-m2-write",
    apiKeyIdFactory: () => `trust-m2-api-key-${++apiKeySequence}`,
    generateKey: () => ISSUED_SECRET,
  });

  const requestBody = {
    tenantSlug: "acme-trust",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust",
  };

  const provision = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    headers: {
      "x-api-key": PROVISIONING_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  assert.equal(provision.status, 201);
  assert.equal(provision.headers["cache-control"], "no-store");

  const created = JSON.parse(provision.body);
  assert.equal(created.ok, true);
  assert.equal(created.provisioned, true);
  assert.equal(created.productId, TRUST_PRODUCT_ID);
  assert.equal(created.environment, "sandbox");
  assert.equal(created.credential.secret, ISSUED_SECRET);
  assert.equal(created.credential.oneTime, true);
  assert.deepEqual(created.credential.scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(created.secretPersistence, "hash-only");
  assert.equal(created.realBiometrics, false);
  assert.equal(created.realMoney, false);
  assert.equal(created.productionPromotion, false);

  const persisted = await readFile(stateFilePath, "utf8");
  assert.equal(persisted.includes(ISSUED_SECRET), false);
  assert.equal(persisted.includes(PROVISIONING_KEY), false);

  const whoami = await gateway.app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-api-key": ISSUED_SECRET,
      "x-tenant-id": created.tenantId,
    },
  });

  assert.equal(whoami.status, 200);
  const identity = JSON.parse(whoami.body);
  assert.equal(identity.identity.role, "client");
  assert.equal(identity.identity.principal.tenantId, created.tenantId);
  assert.deepEqual(identity.identity.principal.scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(identity.tenantContext.tenantId, created.tenantId);

  const crossTenant = await gateway.app.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-api-key": ISSUED_SECRET,
      "x-tenant-id": "component.tenant.other-tenant",
    },
  });
  assert.equal(crossTenant.status, 401);

  const repeat = await gateway.app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    headers: {
      "x-api-key": PROVISIONING_KEY,
    },
    body: JSON.stringify(requestBody),
  });

  assert.equal(repeat.status, 409);
  const repeated = JSON.parse(repeat.body);
  assert.equal(repeated.secretsExposed, false);
  assert.equal(JSON.stringify(repeated).includes(ISSUED_SECRET), false);

  const activeKeys = await gateway.apiKeyLifecycle.listApiKeys(created.tenantId, {
    status: "active",
  });
  assert.equal(activeKeys.length, 1);
  assert.deepEqual(activeKeys[0].scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(Object.hasOwn(activeKeys[0], "secret"), false);
});
