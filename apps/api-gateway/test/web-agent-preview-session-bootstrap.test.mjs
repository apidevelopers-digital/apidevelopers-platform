import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createUniCoPreviewBrowserSessionBootstrap } from "../src/web-agent-preview-session-bootstrap.mjs";

const T0 = new Date("2026-08-19T14:45:00.000Z");
const SECRET = "A".repeat(43);

test("uni.co preview login creates secure browser session without persisting raw credentials", async () => {
  const dir = await mkdtemp(join(tmpdir(), "uni-co-preview-login-"));
  const stateFilePath = join(dir, "state.json");
  const store = createJsonFileStore({ filePath: stateFilePath, fsync: false, clock: () => T0.toISOString() });
  let verifiedInput, accessInput;
  try {
    const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
      store,
      clock: () => T0,
      generateSecret: () => SECRET,
      verifyCredentials: async (input) => {
        verifiedInput = input;
        return { name: "Igor" };
      },
      resolveAccess: async (input) => {
        accessInput = input;
        return {
          principalId: "principal.preview.igor",
          tenantId: "tenant.preview.igor",
          workspaceId: "workspace.preview.igor.uni-co",
          accessGrantId: "grant.preview.igor.uni-co",
        };
      },
    });

    const result = await bootstrap.login({
      host: "unico-preview.apidevelopers.digital",
      email: "  IGOR@example.com ",
      password: "Preview#123",
    });

    assert.deepEqual(verifiedInput, { email: "igor@example.com", password: "Preview#123" });
    assert.equal(accessInput.productId, "product:uni-co");
    assert.deepEqual(accessInput.requiredScopes, ["web:chat"]);
    assert.equal(result.authenticated, true);
    assert.equal(result.productId, "product:uni-co");
    assert.equal(result.agentId, "uni.co");
    assert.equal(result.workspaceId, "workspace.preview.igor.uni-co");
    assert.equal(result.accessGrantId, "grant.preview.igor.uni-co");
    assert.match(result.setCookie, /^__Host-apidevelopers-session=/);
    assert.match(result.setCookie, /Path=\//);
    assert.match(result.setCookie, /HttpOnly/);
    assert.match(result.setCookie, /Secure/);
    assert.match(result.setCookie, /SameSite=Lax/);

    const persisted = await readFile(stateFilePath, "utf8");
    assert.equal(persisted.includes(SECRET), false);
    assert.equal(persisted.includes("Preview#123"), false);
    assert.match(persisted, /web\.browserSessions/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("preview login rejects a non-preview host before credential verification", async () => {
  let called = false;
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store: { transaction: async () => {} },
    verifyCredentials: async () => { called = true; return { name: "x" }; },
    resolveAccess: async () => ({}),
    generateSecret: () => SECRET,
  });

  await assert.rejects(
    () => bootstrap.login({ host: "nexus.apidevelopers.digital", email: "x@y.z", password: "x" }),
    /preview_login_surface_not_allowed/,
  );
  assert.equal(called, false);
});
