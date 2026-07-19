import assert from "node:assert/strict";
import test from "node:test";
import {
  createApiKeyRecord,
  generateApiKey,
  hashApiKey,
  isApiKeyRecordActive,
  revokeApiKeyRecord,
  secureCompareSecrets,
  toPublicApiKeyRecord,
  verifyApiKeyHash,
} from "../src/index.mjs";

test("generates and verifies namespaced API keys", () => {
  const apiKey = generateApiKey({ randomBytesFactory: () => Buffer.alloc(24, 7) });
  const hash = hashApiKey(apiKey);
  assert.match(apiKey, /^apid_/);
  assert.equal(verifyApiKeyHash(apiKey, hash), true);
  assert.equal(verifyApiKeyHash(`${apiKey}x`, hash), false);
  assert.equal(secureCompareSecrets(apiKey, apiKey), true);
});

test("creates and revokes immutable key records", () => {
  const record = createApiKeyRecord({
    apiKey: "apid_test_secret_1234567890",
    id: "key-1",
    clock: () => "2026-07-19T12:00:00.000Z",
  });
  const revoked = revokeApiKeyRecord(record, {
    clock: () => "2026-07-19T13:00:00.000Z",
  });

  assert.equal(isApiKeyRecordActive(record), true);
  assert.equal(isApiKeyRecordActive(revoked), false);
  assert.equal("hash" in toPublicApiKeyRecord(record), false);
  assert.equal(record.status, "active");
});

test("rejects weak inputs and invalid namespaces", () => {
  assert.throws(() => hashApiKey("short"), /at least 8/);
  assert.throws(() => generateApiKey({ prefix: "Bad Prefix" }), /namespace/);
});
