import test from "node:test";
import assert from "node:assert/strict";

import { createAsyncUserService } from "../src/async-service.mjs";

function createAsyncUserRepository() {
  const byId = new Map();
  const emailToId = new Map();

  return {
    kind: "async-test",
    async create(user) {
      if (byId.has(user.id)) throw new Error("user id already exists");
      if (emailToId.has(user.email)) throw new Error("user email already exists");
      byId.set(user.id, structuredClone(user));
      emailToId.set(user.email, user.id);
      return structuredClone(user);
    },
    async replace(user) {
      const current = byId.get(user.id);
      if (!current) throw new Error("user not found");
      if (current.email !== user.email) emailToId.delete(current.email);
      byId.set(user.id, structuredClone(user));
      emailToId.set(user.email, user.id);
      return structuredClone(user);
    },
    async getById(id) {
      return byId.has(id) ? structuredClone(byId.get(id)) : null;
    },
    async getByEmail(email) {
      const id = emailToId.get(String(email).trim().toLowerCase());
      return id ? structuredClone(byId.get(id)) : null;
    },
    async list({ status } = {}) {
      return [...byId.values()]
        .filter((user) => status === undefined || user.status === status)
        .map(structuredClone);
    },
  };
}

test("async user service registers and recovers a user through an async repository", async () => {
  const service = createAsyncUserService({
    repository: createAsyncUserRepository(),
    idFactory: () => "user_001",
    clock: () => "2026-07-22T10:00:00.000Z",
  });

  const created = await service.registerUser({
    email: "Owner@Example.com",
    displayName: "Owner",
  });

  assert.equal(service.repositoryKind, "async-test");
  assert.equal(created.user.id, "user_001");
  assert.equal(created.user.email, "owner@example.com");
  assert.equal(created.user.status, "pending_verification");
  assert.equal(created.events[0].type, "user.registered");
  assert.deepEqual(await service.getUser("user_001"), created.user);
  assert.deepEqual(await service.getUserByEmail("OWNER@EXAMPLE.COM"), created.user);
  assert.deepEqual(await service.listUsers(), [created.user]);
});
