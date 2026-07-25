import assert from "node:assert/strict";
import test from "node:test";

import { createApiKeyLifecycleService } from "../src/lifecycle-service.mjs";

function createRepositoryStub() {
  let stored = null;

  return {
    kind: "stub",
    async create(record) {
      stored = structuredClone(record);
      return structuredClone(record);
    },
    async replace(record) {
      stored = structuredClone(record);
      return structuredClone(record);
    },
    async getById(id) {
      return stored?.id === id ? structuredClone(stored) : null;
    },
    async listByTenant() {
      return stored ? [structuredClone(stored)] : [];
    },
    async getActiveByPrefix() {
      return stored?.status === "active" ? structuredClone(stored) : null;
    },
    async rotate({ previous, current }) {
      stored = structuredClone(current);
      return {
        previous: structuredClone(previous),
        current: structuredClone(current),
      };
    },
  };
}

test("uses a valid UUID when idFactory is not provided", async () => {
  const service = createApiKeyLifecycleService({
    repository: createRepositoryStub(),
    clock: () => "2026-07-25T08:00:00.000Z",
    generateKey: () => ({
      secret: "apid_default_secret",
      prefix: "apid_default",
      keyHash: "hash_default",
    }),
  });

  const issued = await service.issueApiKey({
    tenantId: "tenant_default",
    name: "Default key",
  });

  assert.match(
    issued.apiKey.id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});
