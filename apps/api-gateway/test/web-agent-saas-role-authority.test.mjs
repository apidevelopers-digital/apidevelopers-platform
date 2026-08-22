import assert from "node:assert/strict";
import test from "node:test";

import {
  assertRolePermission,
  createRole,
} from "@apidevelopers/contracts";

const ROLE_BASE = Object.freeze({
  roleId: "component.role.acme.uni-main.member",
  tenantId: "component.tenant.acme",
  workspaceId: "component.workspace.acme.uni-main",
  scope: "workspace",
  key: "member",
  createdAt: "2026-08-21T05:00:00.000Z",
});

test("Web Agent SaaS authority rejects an inactive Role even with chat:use", () => {
  const role = createRole({
    ...ROLE_BASE,
    permissions: ["chat:use"],
    status: "suspended",
  });

  assert.throws(
    () => assertRolePermission(role, "chat:use"),
    /role permission missing/,
  );
});

test("Web Agent SaaS authority rejects an active Role without chat:use", () => {
  const role = createRole({
    ...ROLE_BASE,
    permissions: ["workspace:read"],
    status: "active",
  });

  assert.throws(
    () => assertRolePermission(role, "chat:use"),
    /role permission missing/,
  );
});

test("Web Agent SaaS authority accepts an active Role with chat:use", () => {
  const role = createRole({
    ...ROLE_BASE,
    permissions: ["chat:use"],
    status: "active",
  });

  assert.equal(assertRolePermission(role, "chat:use"), true);
});
