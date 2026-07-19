import assert from "node:assert/strict";
import test from "node:test";
import { RegistryError, createRegistry } from "../src/index.mjs";

test("registry sorts, filters and clones entries", () => {
  const registry = createRegistry({
    entries: [
      { id: "zeta", visibility: "internal", tags: ["ops"] },
      { id: "alpha", visibility: "public", tags: ["api", "api"] },
    ],
  });

  assert.deepEqual(registry.list().map((entry) => entry.id), ["alpha", "zeta"]);
  assert.deepEqual(registry.list({ visibility: "public" })[0].tags, ["api"]);

  const entry = registry.get("alpha");
  entry.tags.push("mutated");
  assert.deepEqual(registry.get("alpha").tags, ["api"]);
});

test("registry rejects duplicates unless replacement is explicit", () => {
  const registry = createRegistry({ entries: [{ id: "api" }] });

  assert.throws(
    () => registry.register({ id: "api" }),
    (error) => error instanceof RegistryError
      && error.code === "registry_entry_exists"
      && error.status === 409,
  );

  registry.register({ id: "api", status: "beta" }, { replace: true });
  assert.equal(registry.get("api").status, "beta");
});

test("registry snapshots are deterministic", () => {
  const registry = createRegistry({
    entries: [{ id: "b" }, { id: "a", status: "active" }],
  });

  const snapshot = registry.snapshot({ status: "active" });
  assert.equal(snapshot.count, 2);
  assert.deepEqual(snapshot.items.map((entry) => entry.id), ["a", "b"]);
});
