import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  createJsonFileClientRepository,
  createMemoryClientRepository,
} from "../src/client-repository.mjs";
import {
  createClientRegistry,
  hashApiKey,
} from "../src/client-registry.mjs";

function factories() {
  let client = 0;
  let key = 0;
  let secret = 0;

  return {
    clock: () => "2026-07-19T12:00:00.000Z",
    clientId: () => `client-${++client}`,
    keyId: () => `key-${++key}`,
    keyFactory: () => `apid_test_secret_${++secret}`,
  };
}

test("creates, rotates and revokes API Keys without exposing hashes", () => {
  const store = createClientRegistry(factories());
  const created = store.createClient({
    name: "Example",
    contactEmail: "DEV@EXAMPLE.TEST",
  });

  assert.equal(created.client.contactEmail, "dev@example.test");
  assert.equal(created.client.keys.length, 1);
  assert.equal("hash" in created.client.keys[0], false);
  assert.equal(store.authenticate(created.apiKey).id, created.client.id);

  const rotated = store.rotateApiKey(created.client.id);
  assert.equal(rotated.client.keys.length, 2);
  assert.equal(store.authenticate(created.apiKey).id, created.client.id);
  assert.equal(store.authenticate(rotated.apiKey).id, created.client.id);

  store.revokeApiKey(created.client.id, created.key.id);
  assert.equal(store.authenticate(created.apiKey), null);
  assert.equal(store.authenticate(rotated.apiKey).id, created.client.id);
});

test("revoking a client revokes all active keys", () => {
  const store = createClientRegistry(factories());
  const created = store.createClient({
    name: "Example",
    contactEmail: "dev@example.test",
  });
  const rotated = store.rotateApiKey(created.client.id);

  const client = store.updateClientStatus(
    created.client.id,
    "revoked",
  );

  assert.equal(client.status, "revoked");
  assert.ok(client.keys.every((key) => key.status === "revoked"));
  assert.equal(store.authenticate(created.apiKey), null);
  assert.equal(store.authenticate(rotated.apiKey), null);
});

test("persists versioned state and authenticates after restart", () => {
  const directory = mkdtempSync(
    join(tmpdir(), "api-gateway-store-"),
  );
  const filePath = join(directory, "clients.json");

  try {
    const firstStore = createClientRegistry({
      ...factories(),
      repository: createJsonFileClientRepository({ filePath }),
    });
    const created = firstStore.createClient({
      name: "Persistent",
      contactEmail: "persistent@example.test",
    });

    const persisted = JSON.parse(readFileSync(filePath, "utf8"));
    assert.equal(persisted.schemaVersion, 2);
    assert.equal(persisted.clients.length, 1);
    assert.equal("apiKey" in persisted.clients[0], false);
    assert.equal(
      persisted.clients[0].keys[0].hash,
      hashApiKey(created.apiKey),
    );

    const secondStore = createClientRegistry({
      ...factories(),
      repository: createJsonFileClientRepository({ filePath }),
    });
    assert.equal(
      secondStore.authenticate(created.apiKey).name,
      "Persistent",
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("migrates a legacy single-hash client into schema version 2", () => {
  const legacyKey = "apid_legacy_test";
  const repository = createMemoryClientRepository({
    initialState: [
      {
        id: "legacy-client",
        name: "Legacy",
        contactEmail: "legacy@example.test",
        status: "active",
        scopes: ["api:read"],
        apiKeyHash: hashApiKey(legacyKey),
        createdAt: "2026-07-18T12:00:00.000Z",
      },
    ],
  });

  const store = createClientRegistry({
    ...factories(),
    repository,
  });

  assert.equal(store.authenticate(legacyKey).id, "legacy-client");
  const migrated = repository.load();
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.clients[0].keys.length, 1);
  assert.equal("apiKeyHash" in migrated.clients[0], false);
});
