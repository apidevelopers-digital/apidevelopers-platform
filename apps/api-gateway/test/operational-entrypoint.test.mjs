import assert from "node:assert/strict";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { isDirectExecution } from "../src/operational-server.mjs";

test("operational entrypoint resolves filesystem aliases", async (t) => {
  const directory = await mkdtemp(
    join(tmpdir(), "api-gateway-operational-entrypoint-"),
  );
  t.after(() => rm(directory, { recursive: true, force: true }));

  const target = fileURLToPath(
    new URL("../src/operational-server.mjs", import.meta.url),
  );
  const alias = join(directory, "operational-server.mjs");
  await symlink(target, alias);

  assert.equal(
    isDirectExecution({
      moduleUrl: pathToFileURL(target).href,
      argvPath: alias,
    }),
    true,
  );
});

test("operational entrypoint rejects a different executable", () => {
  assert.equal(
    isDirectExecution({
      moduleUrl: import.meta.url,
      argvPath: process.execPath,
    }),
    false,
  );
});

test("operational entrypoint is false without argv path", () => {
  assert.equal(
    isDirectExecution({
      moduleUrl: import.meta.url,
      argvPath: undefined,
    }),
    false,
  );
});
