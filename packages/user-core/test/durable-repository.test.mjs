import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createDurableUserRepository } from "../src/durable-repository.mjs";

test("durable user repository preserves and recovers users", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "user-durable-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const filePath = join(directory, "state.json");
  const store = createJsonFileStore({
    filePath,
    clock: () => "2026-07-22T10:00:00.000Z",
    idFactory: () => "test-write",
  });

  const repository = createDurableUserRepository({ store });

  const user = {
    id: "user_001",
    email: "owner@example.com",
    displayName: "Owner",
    status: "pending_verification",
    metadata: {},
    createdAt: "2026-07-22T10:00:00.000Z",
    updatedAt: "2026-07-22T10:00:00.000Z",
  };

  await repository.create(user);

  assert.deepEqual(await repository.getById("user_001"), user);
  assert.deepEqual(await repository.getByEmail("OWNER@EXAMPLE.COM"), user);
  assert.deepEqual(
    await repository.list({ status: "pending_verification" }),
    [user],
  );

  const recovered = createDurableUserRepository({
    store: createJsonFileStore({ filePath }),
  });

  assert.deepEqual(await recovered.getById("user_001"), user);
  assert.deepEqual(await recovered.getByEmail("owner@example.com"), user);
});
