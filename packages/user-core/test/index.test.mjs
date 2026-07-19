
import assert from "node:assert/strict";
import test from "node:test";
import {
  UserDomainError,
  assertUserActive,
  assertUserEmailVerified,
  createMemoryUserRepository,
  createUserRecord,
  createUserService,
  normalizeUserEmail,
} from "../src/index.mjs";

const at = "2026-07-19T23:30:00.000Z";

function record(overrides = {}) {
  return createUserRecord({
    id: "user-1",
    email: "Pessoa@Example.COM",
    displayName: "Pessoa",
    createdAt: at,
    ...overrides,
  });
}

test("normalizes emails and returns immutable records", () => {
  assert.equal(normalizeUserEmail(" Pessoa@Example.COM "), "pessoa@example.com");
  const user = record({ metadata: { locale: "pt-BR" } });
  assert.equal(user.email, "pessoa@example.com");
  assert.throws(() => { user.metadata.locale = "en"; }, TypeError);
});

test("repository protects unique id and email", () => {
  const repository = createMemoryUserRepository();
  repository.create(record());
  assert.throws(
    () => repository.create(record()),
    (error) => error.code === "user_id_conflict",
  );
  assert.throws(
    () => repository.create(record({ id: "user-2" })),
    (error) => error.code === "user_email_conflict",
  );
  assert.equal(repository.getByEmail("PESSOA@example.com").id, "user-1");
});

test("service registers and verifies a user with domain events", () => {
  let tick = 0;
  const service = createUserService({
    idFactory: () => "user-1",
    clock: () => new Date(Date.parse(at) + tick++ * 1000).toISOString(),
  });
  const registered = service.registerUser({
    email: "pessoa@example.com",
    displayName: "Pessoa",
  });
  assert.equal(registered.user.status, "pending_verification");
  assert.equal(registered.events[0].type, "user.registered");

  const verified = service.verifyEmail("user-1");
  assert.equal(verified.user.status, "active");
  assert.equal(verified.events[0].type, "user.email_verified");
  assert.equal(assertUserActive(verified.user), true);
  assert.equal(assertUserEmailVerified(verified.user), true);
});

test("service controls lifecycle transitions without mutation", () => {
  let tick = 0;
  const service = createUserService({
    idFactory: () => "user-1",
    clock: () => new Date(Date.parse(at) + tick++ * 1000).toISOString(),
  });
  service.registerUser({ email: "pessoa@example.com", displayName: "Pessoa" });
  service.verifyEmail("user-1");
  assert.equal(service.suspendUser("user-1").user.status, "suspended");
  assert.equal(service.reactivateUser("user-1").events[0].type, "user.reactivated");
  assert.equal(service.deleteUser("user-1").user.status, "deleted");
  assert.throws(
    () => service.reactivateUser("user-1"),
    (error) =>
      error instanceof UserDomainError &&
      error.code === "invalid_user_transition",
  );
  assert.equal(service.getUser("user-1").status, "deleted");
});

test("profile updates are audited and deleted users remain immutable", () => {
  let tick = 0;
  const service = createUserService({
    idFactory: () => "user-1",
    clock: () => new Date(Date.parse(at) + tick++ * 1000).toISOString(),
  });
  service.registerUser({ email: "pessoa@example.com", displayName: "Pessoa" });
  const updated = service.updateProfile("user-1", {
    displayName: "Pessoa Atualizada",
    metadata: { locale: "pt-BR" },
  });
  assert.equal(updated.user.displayName, "Pessoa Atualizada");
  assert.equal(updated.events[0].type, "user.profile_updated");
  service.deleteUser("user-1");
  assert.throws(
    () => service.updateProfile("user-1", { displayName: "Falha" }),
    (error) => error.code === "user_deleted",
  );
});
