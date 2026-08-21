import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createSaasRuntime } from "@apidevelopers/saas-runtime";
import { createDurableApiKeyRepository } from "@apidevelopers/apikey-core/durable-repository";
import { createApiKeyLifecycleService } from "@apidevelopers/apikey-core/lifecycle-service";
import { createDurableApiKeyAuthenticator } from "@apidevelopers/auth-core";
import {
  TRUST_PRODUCT_ID,
  TRUST_SANDBOX_PROVISIONING_CONTRACT,
  TRUST_SANDBOX_SCOPES,
} from "@apidevelopers/contracts";

import { createApp } from "../src/server.mjs";
import {
  createTrustSandboxProvisioningApp,
  trustSandboxProvisioningContract,
} from "../src/saas-trust-sandbox-provisioning.mjs";

const NOW = "2026-08-20T23:45:00.000Z";

function provisioningIdentity(scopes = ["saas:provision"]) {
  return Object.freeze({
    role: "service",
    principal: Object.freeze({
      id: "trust-m2-test-provisioner",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

test("Trust sandbox contract is fail-closed and limited to authorized Trust scopes", () => {
  assert.equal(trustSandboxProvisioningContract, TRUST_SANDBOX_PROVISIONING_CONTRACT);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.productId, "product:trust");
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.environment, "sandbox");
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.requiredProvisioningScope, "saas:provision");
  assert.deepEqual(TRUST_SANDBOX_SCOPES, [
    "trust:verification:create",
    "trust:verification:read",
    "trust:governance:preview",
    "trust:evidence:read",
    "trust:audit:read",
  ]);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.oneTimeSecret, true);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.persistedSecret, false);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.productionPromotion, false);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.realBiometrics, false);
  assert.equal(TRUST_SANDBOX_PROVISIONING_CONTRACT.realMoney, false);
});

test("Trust M2 provisions sandbox tenant credential, persists only hash and authenticates whoami", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-m2-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const statePath = join(directory, "state.json");
  const store = createJsonFileStore({
    filePath: statePath,
    clock: () => NOW,
    idFactory: () => "trust-m2-write",
  });

  const realSaasRuntime = createSaasRuntime({
    store,
    clock: () => NOW,
  });
  const operationalTenants = new Set();
  const saasRuntime = Object.freeze({
    async registerTenantWorkspace(input) {
      const result = await realSaasRuntime.registerTenantWorkspace(input);
      operationalTenants.add(input.tenant.tenantId);
      return result;
    },
  });

  const repository = createDurableApiKeyRepository({ store });
  const apiKeyLifecycle = createApiKeyLifecycleService({
    repository,
    clock: () => NOW,
    assertTenantOperational: async (tenantId) => operationalTenants.has(tenantId),
  });

  const provisioningApp = createTrustSandboxProvisioningApp({
    authenticator: {
      async authenticate() {
        return provisioningIdentity();
      },
    },
    saasRuntime,
    apiKeyLifecycle,
    clock: () => NOW,
  });

  const requestBody = {
    tenantSlug: "acme-trust",
    workspaceSlug: "sandbox-main",
    displayName: "Acme Trust",
  };

  const first = await provisioningApp.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    body: requestBody,
  });

  assert.equal(first.status, 201);
  const provisioned = JSON.parse(first.body);
  assert.equal(provisioned.ok, true);
  assert.equal(provisioned.productId, TRUST_PRODUCT_ID);
  assert.equal(provisioned.environment, "sandbox");
  assert.equal(provisioned.credential.oneTime, true);
  assert.deepEqual(provisioned.credential.scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(typeof provisioned.credential.secret, "string");
  assert.ok(provisioned.credential.secret.length > 20);
  assert.equal(provisioned.secretPersistence, "hash-only");
  assert.equal(provisioned.realBiometrics, false);
  assert.equal(provisioned.realMoney, false);
  assert.equal(provisioned.productionPromotion, false);

  const record = await repository.getById(provisioned.credential.id);
  assert.equal(record.tenantId, provisioned.tenantId);
  assert.deepEqual(record.scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(Object.hasOwn(record, "secret"), false);
  assert.ok(record.hash || record.keyHash);

  const persisted = await readFile(statePath, "utf8");
  assert.equal(persisted.includes(provisioned.credential.secret), false);

  const authenticator = createDurableApiKeyAuthenticator({ repository });
  const gateway = createApp({
    authenticator,
    audit: {
      async recordTenantContextIssued() {
        return undefined;
      },
    },
  });

  const whoami = await gateway.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-api-key": provisioned.credential.secret,
      "x-tenant-id": provisioned.tenantId,
    },
  });

  assert.equal(whoami.status, 200);
  const identity = JSON.parse(whoami.body);
  assert.equal(identity.identity.role, "client");
  assert.equal(identity.identity.principal.tenantId, provisioned.tenantId);
  assert.deepEqual(identity.identity.principal.scopes, TRUST_SANDBOX_SCOPES);
  assert.equal(identity.tenantContext.tenantId, provisioned.tenantId);

  const wrongTenant = await gateway.handleRequest({
    method: "GET",
    url: "/v1/whoami",
    headers: {
      "x-api-key": provisioned.credential.secret,
      "x-tenant-id": "component.tenant.other-tenant",
    },
  });
  assert.equal(wrongTenant.status, 401);

  const second = await provisioningApp.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    body: requestBody,
  });
  assert.equal(second.status, 409);
  const duplicate = JSON.parse(second.body);
  assert.equal(duplicate.reason, "trust_sandbox_credential_already_exists");
  assert.equal(duplicate.secretsExposed, false);
  assert.equal(JSON.stringify(duplicate).includes(provisioned.credential.secret), false);

  const active = await apiKeyLifecycle.listApiKeys(provisioned.tenantId, { status: "active" });
  assert.equal(active.length, 1);
});

test("Trust M2 rejects missing provisioning scope before tenant mutation", async () => {
  let registrations = 0;
  const app = createTrustSandboxProvisioningApp({
    authenticator: {
      async authenticate() {
        return provisioningIdentity(["saas:access:delegate"]);
      },
    },
    saasRuntime: {
      async registerTenantWorkspace() {
        registrations += 1;
      },
    },
    apiKeyLifecycle: {
      async issueApiKey() {
        throw new Error("must_not_issue");
      },
      async listApiKeys() {
        return [];
      },
  },
  });

  const response = await app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_PROVISIONING_CONTRACT.path,
    body: {
      tenantSlug: "blocked",
      workspaceSlug: "sandbox",
      displayName: "Blocked",
    },
  });

  assert.equal(response.status, 403);
  assert.equal(registrations, 0);
});
