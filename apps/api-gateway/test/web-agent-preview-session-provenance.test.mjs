import assert from "node:assert/strict";
import test from "node:test";
import { createUniCoPreviewBrowserSessionBootstrap } from "../src/web-agent-preview-session-bootstrap.mjs";

test("preview session persists only the password method as source provenance", async () => {
  const writes = [];
  const bootstrap = createUniCoPreviewBrowserSessionBootstrap({
    store: { async transaction(work) { return work({ put: (...args) => writes.push(args) }); } },
    clock: () => new Date("2026-09-04T10:00:00.000Z"),
    generateSecret: () => "A".repeat(43),
    verifyCredentials: async () => ({ name: "Igor" }),
    resolveAccess: async () => ({
      principalId: "principal_1",
      tenantId: "tenant_1",
      workspaceId: "workspace_1",
      accessGrantId: "grant_1",
    }),
  });

  await bootstrap.login({
    host: "unico-preview.apidevelopers.digital",
    email: "igor@example.com",
    password: "Preview#123",
  });

  const session = writes.find(([, , value]) => value?.principal)?.[2];
  assert.ok(session);
  assert.equal(session.principal.authenticationMethod, "password");
  const persisted = JSON.stringify(writes);
  assert.equal(persisted.includes("Preview#123"), false);
  assert.equal(persisted.includes("A".repeat(43)), false);
});
