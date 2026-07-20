import test from "node:test";
import assert from "node:assert/strict";

import { createGitCommitReader } from "../src/git-reader.mjs";

const COMMIT = "e068a96379995050ef06de8a862af01db4c9d539";

function fixture(overrides = {}) {
  const blobs = new Map([
    ["docs/architecture/PORTAL_DATA_MODEL.md", "# Portal\n"],
    ["docs/architecture/portal/README.md", "# Portal modules\n"],
  ]);

  const calls = [];
  const reader = createGitCommitReader({
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    readBlob: async (input) => {
      calls.push(["read", input]);
      const content = blobs.get(input.path);
      if (content === undefined) throw new Error("not found");
      return { content, commit: COMMIT };
    },
    listTree: async (input) => {
      calls.push(["list", input]);
      return [...blobs.keys()].map((path) => ({ path, commit: COMMIT }));
    },
    ...overrides,
  });

  return { reader, calls, blobs };
}

test("requires a full immutable commit SHA", () => {
  assert.throws(
    () => createGitCommitReader({
      repository: "sitedauni/apidevelopers-platform",
      commit: "main",
      readBlob: async () => ({}),
      listTree: async () => [],
    }),
    (error) => error.code === "PORTAL_GIT_READER_COMMIT_INVALID",
  );
});

test("forwards the fixed repository and commit to every adapter call", async () => {
  const { reader, calls } = fixture();
  await reader.readText("docs/architecture/PORTAL_DATA_MODEL.md");
  await reader.list("docs/architecture");
  assert.equal(calls.length, 2);
  for (const [, input] of calls) {
    assert.equal(input.repository, "sitedauni/apidevelopers-platform");
    assert.equal(input.commit, COMMIT);
  }
});

test("reads UTF-8 text and returns deterministic SHA-256 evidence", async () => {
  const { reader } = fixture();
  const result = await reader.readText("docs/architecture/PORTAL_DATA_MODEL.md");
  assert.equal(result.content, "# Portal\n");
  assert.equal(result.commit, COMMIT);
  assert.equal(result.checksum, "5bc925958c9462fa1df51be2acad54b62fa279a50dd2e74b6df8d1560d4e73f7");
});

test("rejects mixed-commit blob responses", async () => {
  const { reader } = fixture({
    readBlob: async () => ({ content: "x", commit: "a".repeat(40) }),
  });
  await assert.rejects(
    reader.readText("docs/architecture/PORTAL_DATA_MODEL.md"),
    (error) => error.code === "PORTAL_GIT_READER_MIXED_COMMIT",
  );
});

test("normalizes tree output with stable order and deduplication", async () => {
  const { reader } = fixture({
    listTree: async () => [
      "docs/architecture/portal/README.md",
      "docs/architecture/PORTAL_DATA_MODEL.md",
      "docs/architecture/portal/README.md",
    ],
  });
  assert.deepEqual(await reader.list("docs/architecture"), [
    "docs/architecture/PORTAL_DATA_MODEL.md",
    "docs/architecture/portal/README.md",
  ]);
});

test("rejects tree entries outside the requested prefix", async () => {
  const { reader } = fixture({
    listTree: async () => ["packages/onboarding-core/package.json"],
  });
  await assert.rejects(
    reader.list("docs/architecture"),
    (error) => error.code === "PORTAL_GIT_READER_TREE_INVALID",
  );
});

test("rejects absolute, traversal and backslash paths before adapter access", async () => {
  const { reader, calls } = fixture();
  for (const path of ["/etc/passwd", "../secret", "docs\\secret"]) {
    await assert.rejects(reader.readText(path), (error) => error.code === "PORTAL_GIT_READER_PATH_INVALID");
  }
  assert.equal(calls.length, 0);
});

test("readMany deduplicates and reads in stable lexical order", async () => {
  const { reader, calls } = fixture();
  const results = await reader.readMany([
    "docs/architecture/portal/README.md",
    "docs/architecture/PORTAL_DATA_MODEL.md",
    "docs/architecture/portal/README.md",
  ]);
  assert.deepEqual(results.map((item) => item.path), [
    "docs/architecture/PORTAL_DATA_MODEL.md",
    "docs/architecture/portal/README.md",
  ]);
  assert.deepEqual(calls.map(([, input]) => input.path), [
    "docs/architecture/PORTAL_DATA_MODEL.md",
    "docs/architecture/portal/README.md",
  ]);
});

test("reader is explicitly read-only", () => {
  const { reader } = fixture();
  assert.equal(reader.mutationAllowed, false);
  assert.equal("write" in reader, false);
  assert.equal("commit" in reader && typeof reader.commit === "function", false);
});
