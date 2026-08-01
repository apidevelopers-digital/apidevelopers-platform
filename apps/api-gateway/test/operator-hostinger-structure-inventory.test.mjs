import assert from "node:assert/strict";
import test from "node:test";

import {
  HostingerStructureInventoryError,
  createHostingerStructureInventoryService,
} from "../src/operator-hostinger-structure-inventory.mjs";

const BASE_REQUEST = Object.freeze({
  institution: "API Developers.digital",
  tenant: "uni.",
  operator: "Igor",
  correlationId: "corr_20260801_001",
  host: "sitedauni.com",
  mode: "metadata-only",
  includeContent: false,
  paths: ["includes", "area-cliente/api"],
  extensions: ["php", "sql"],
});

function metadata(path, overrides = {}) {
  return {
    path,
    extension: path.split(".").at(-1),
    sizeBytes: 128,
    modifiedAt: "2026-08-01T12:00:00.000Z",
    mime: "text/x-php",
    sha256: "a".repeat(64),
    ...overrides,
  };
}

function createService(adapter) {
  return createHostingerStructureInventoryService({
    inventoryAdapter: adapter,
    now: () => "2026-08-01T12:30:00.000Z",
  });
}

test("returns only sanitized metadata in deterministic order", async () => {
  const calls = [];
  const service = createService({
    async listMetadata(request) {
      calls.push(request);
      return {
        items: [
          metadata("includes/upload.php"),
          metadata("includes/api.php"),
        ],
        blocked: [
          { path: "includes/private.php", reason: "policy_blocked" },
        ],
      };
    },
  });

  const result = await service.inventory(BASE_REQUEST);

  assert.equal(result.operationId, "operatorHostingerStructureInventory");
  assert.equal(result.productionChanged, false);
  assert.equal(result.contentReturned, false);
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.items.map((item) => item.path),
    ["includes/api.php", "includes/upload.php"],
  );
  assert.deepEqual(
    Object.keys(result.items[0]).sort(),
    ["extension", "mime", "modifiedAt", "path", "sha256", "sizeBytes"].sort(),
  );
  assert.deepEqual(calls, [
    {
      host: "sitedauni.com",
      paths: ["includes", "area-cliente/api"],
      extensions: ["php", "sql"],
      includeContent: false,
      correlationId: "corr_20260801_001",
    },
  ]);
});

test("rejects path traversal and absolute paths", async () => {
  const service = createService({
    async listMetadata() {
      throw new Error("must not be called");
    },
  });

  for (const path of ["../.env", "/etc/passwd", "includes\\api.php"]) {
    await assert.rejects(
      service.inventory({ ...BASE_REQUEST, paths: [path] }),
      (error) =>
        error instanceof HostingerStructureInventoryError &&
        error.code === "path_not_allowed",
    );
  }
});

test("rejects roots and extensions outside the allowlist", async () => {
  const service = createService({
    async listMetadata() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, paths: ["public/uploads"] }),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "path_not_allowed",
  );

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, extensions: ["env"] }),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "extension_not_allowed",
  );
});

test("rejects content requests and non-allowlisted hosts", async () => {
  const service = createService({
    async listMetadata() {
      throw new Error("must not be called");
    },
  });

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, includeContent: true }),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "content_not_allowed",
  );

  await assert.rejects(
    service.inventory({ ...BASE_REQUEST, host: "example.com" }),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "host_not_allowed",
  );
});

test("fails closed when a provider returns content or unsafe metadata", async () => {
  const contentService = createService({
    async listMetadata() {
      return {
        items: [
          {
            ...metadata("includes/api.php"),
            content: "<?php echo 'must not leave provider';",
          },
        ],
      };
    },
  });

  await assert.rejects(
    contentService.inventory(BASE_REQUEST),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "provider_returned_content",
  );

  const digestService = createService({
    async listMetadata() {
      return {
        items: [
          metadata("includes/api.php", { sha256: "invalid" }),
        ],
      };
    },
  });

  await assert.rejects(
    digestService.inventory(BASE_REQUEST),
    (error) =>
      error instanceof HostingerStructureInventoryError &&
      error.code === "provider_contract_violation",
  );
});
