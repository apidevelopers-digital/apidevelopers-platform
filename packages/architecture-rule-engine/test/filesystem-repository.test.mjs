import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createFilesystemRepository } from "../src/filesystem-repository.mjs";

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), "architecture-fs-"));
  await mkdir(path.join(root, "packages", "example"), { recursive: true });
  await mkdir(path.join(root, "node_modules", "ignored"), { recursive: true });
  await mkdir(path.join(root, ".git"), { recursive: true });
  await writeFile(path.join(root, "package.json"), "{}\n");
  await writeFile(path.join(root, "packages", "example", "package.json"), "{}\n");
  await writeFile(path.join(root, "node_modules", "ignored", "index.js"), "");
  await writeFile(path.join(root, ".git", "HEAD"), "ref");
  await symlink(
    path.join(root, "package.json"),
    path.join(root, "packages", "example", "linked.json"),
  );
  return root;
}

test("filesystem repository lists only safe regular files deterministically", async () => {
  const root = await fixture();
  const repository = createFilesystemRepository(root);

  assert.deepEqual(await repository.listFiles(), [
    "package.json",
    "packages/example/package.json",
  ]);
});

test("filesystem repository reads text and checks exact files", async () => {
  const root = await fixture();
  const repository = createFilesystemRepository(root);

  assert.equal(await repository.exists("package.json"), true);
  assert.equal(await repository.exists("packages/example"), false);
  assert.equal(await repository.exists("missing.json"), false);
  assert.equal(await repository.readText("./package.json"), "{}\n");
});

test("filesystem repository blocks traversal and symbolic links", async () => {
  const root = await fixture();
  const repository = createFilesystemRepository(root);

  await assert.rejects(repository.readText("../outside"), {
    code: "UNSAFE_PATH",
  });
  await assert.rejects(repository.readText("packages/example/linked.json"), {
    code: "FILE_NOT_FOUND",
  });
});
