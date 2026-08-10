import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createJsonFileStore } from "../../persistence-core/src/index.mjs";
import { createFederatedPrincipalRuntime } from "../src/index.mjs";

const T0 = "2026-08-10T21:30:00.000Z";

test("federated principal is opaque, idempotent and does not persist the external subject", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-federated-principal-"));
  const filePath = join(dir, "state.json");
  const store = createJsonFileStore({ filePath, fsync: false, clock: () => T0 });
  const runtime = createFederatedPrincipalRuntime({ store, clock: () => T0 });

  try {
    const input = {
      tenantId: "component.tenant.acme",
      provider: "unico-operator-session",
      externalSubject: "Operator@Example.COM",
    };

    const first = await runtime.resolveFederatedPrincipal(input);
    const second = await runtime.resolveFederatedPrincipal({
      ...input,
      externalSubject: " operator@example.com ",
    });

    assert.deepEqual(second, first);
    assert.match(first.principalId, /^component\.principal\.[a-f0-9]{32}$/);
    assert.match(first.federatedPrincipalId, /^component\.federated-principal\.[a-f0-9]{64}$/);
    assert.equal(first.tenantId, input.tenantId);
    assert.equal(first.provider, input.provider);
    assert.equal(first.status, "active");

    const persisted = await readFile(filePath, "utf8");
    assert.equal(persisted.includes("operator@example.com"), false);
    assert.equal(persisted.includes("Operator@Example.COM"), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("same external subject resolves to a different principal in another tenant", async () => {
  const dir = await mkdtemp(join(tmpdir(), "apd-saas-federated-tenant-"));
  const store = createJsonFileStore({
    filePath: join(dir, "state.json"),
    fsync: false,
    clock: () => T0,
  });
  const runtime = createFederatedPrincipalRuntime({ store, clock: () => T0 });

  try {
    const left = await runtime.resolveFederatedPrincipal({
      tenantId: "component.tenant.acme",
      provider: "unico-operator-session",
      externalSubject: "operator@example.com",
    });
    const right = await runtime.resolveFederatedPrincipal({
      tenantId: "component.tenant.beta",
      provider: "unico-operator-session",
      externalSubject: "operator@example.com",
    });

    assert.notEqual(left.principalId, right.principalId);
    assert.notEqual(left.federatedPrincipalId, right.federatedPrincipalId);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
