import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import {
  TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT,
  TRUST_SANDBOX_VERIFICATION_READ_CONTRACT,
} from "@apidevelopers/contracts";

import { createTrustSandboxVerificationApp } from "../src/trust-sandbox-verifications.mjs";

const NOW = "2026-08-21T01:40:00.000Z";

function clientIdentity(tenantId, scopes) {
  return Object.freeze({
    role: "client",
    principal: Object.freeze({
      id: `key:${tenantId}`,
      tenantId,
      name: "Trust sandbox test key",
      status: "active",
      scopes: Object.freeze([...scopes]),
    }),
  });
}

test("Trust sandbox verification API persists mock-only tenant-scoped records", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-verifications-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(directory, "state.json"),
    clock: () => NOW,
    idFactory: () => "store-write",
  });

  const identities = new Map([
    ["tenant-a", clientIdentity("tenant-a", [
      "trust:verification:create",
      "trust:verification:read",
    ])],
    ["tenant-b", clientIdentity("tenant-b", [
      "trust:verification:create",
      "trust:verification:read",
    ])],
    ["tenant-read", clientIdentity("tenant-read", [
      "trust:verification:read",
    ])],
  ]);

  const app = createTrustSandboxVerificationApp({
    authenticator: {
      async authenticate(headers = {}) {
        return identities.get(headers["x-test-tenant"]) ?? null;
      },
    },
    store,
    clock: () => NOW,
    idFactory: () => "verification-001",
  });

  const createdResponse = await app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    headers: { "x-test-tenant": "tenant-a" },
    body: JSON.stringify({
      subjectRef: "subject:customer-001",
      modality: "face+liveness",
    }),
  });

  assert.equal(createdResponse.status, 201);
  assert.equal(createdResponse.headers["cache-control"], "no-store");

  const created = JSON.parse(createdResponse.body).verification;
  assert.equal(created.verificationId, "trust-verification-verification-001");
  assert.equal(created.tenantId, "tenant-a");
  assert.equal(created.environment, "sandbox");
  assert.equal(created.mode, "mock");
  assert.equal(created.status, "accepted");
  assert.equal(created.adapter, "none");
  assert.equal(created.biometricProcessing, false);
  assert.equal(created.result, null);

  const stored = await app.repository.getById(created.verificationId);
  assert.deepEqual(stored, created);

  const readResponse = await app.handleRequest({
    method: "GET",
    url: `${TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix}${encodeURIComponent(created.verificationId)}`,
    headers: { "x-test-tenant": "tenant-a" },
  });
  assert.equal(readResponse.status, 200);
  assert.deepEqual(JSON.parse(readResponse.body).verification, created);

  const crossTenant = await app.handleRequest({
    method: "GET",
    url: `${TRUST_SANDBOX_VERIFICATION_READ_CONTRACT.pathPrefix}${encodeURIComponent(created.verificationId)}`,
    headers: { "x-test-tenant": "tenant-b" },
  });
  assert.equal(crossTenant.status, 404);
  assert.equal(JSON.parse(crossTenant.body).reason, "verification_not_found");

  const rawBiometricRejected = await app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    headers: { "x-test-tenant": "tenant-a" },
    body: JSON.stringify({
      subjectRef: "subject:customer-002",
      modality: "face",
      image: "data:image/png;base64,not-allowed",
    }),
  });
  assert.equal(rawBiometricRejected.status, 400);

  const readOnlyCreate = await app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    headers: { "x-test-tenant": "tenant-read" },
    body: JSON.stringify({
      subjectRef: "subject:customer-003",
      modality: "face",
    }),
  });
  assert.equal(readOnlyCreate.status, 403);

  const records = await app.repository.list();
  assert.equal(records.length, 1);
});

test("Trust sandbox verification API is fail-closed for anonymous requests", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "trust-verifications-auth-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const store = createJsonFileStore({
    filePath: join(directory, "state.json"),
  });

  const app = createTrustSandboxVerificationApp({
    authenticator: {
      async authenticate() {
        return null;
      },
    },
    store,
  });

  const response = await app.handleRequest({
    method: "POST",
    url: TRUST_SANDBOX_VERIFICATION_CREATE_CONTRACT.path,
    body: JSON.stringify({
      subjectRef: "subject:anonymous",
      modality: "face",
    }),
  });

  assert.equal(response.status, 401);
});
