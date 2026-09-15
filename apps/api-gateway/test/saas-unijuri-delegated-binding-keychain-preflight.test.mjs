import test from "node:test";
import assert from "node:assert/strict";

import {
  UNIJURI_DELEGATED_BINDING_PLANNED_KEY_ID,
  assertUniJuriRemoteSignerKeychainPreflightIsReadOnly,
  collectUniJuriRemoteSignerKeychainPreflight,
} from "../src/saas-unijuri-delegated-binding-keychain-preflight.mjs";

function fakeExec(responses = new Map()) {
  return async (command, args = []) => {
    const key = `${command} ${args.join(" ")}`;
    const value = responses.get(key);
    if (value instanceof Error) throw value;
    if (value) return value;
    const error = new Error("not found");
    error.code = 44;
    throw error;
  };
}

test("UniJuri keychain preflight is read-only and absence is advisory", async () => {
  const result = await collectUniJuriRemoteSignerKeychainPreflight({
    platform: "darwin",
    arch: "x64",
    nodePath: "/opt/homebrew/bin/node",
    accessFn: async () => {},
    execFn: fakeExec(),
  });

  assert.equal(result.mode, "dry-run-read-only");
  assert.equal(result.writesPerformed, false);
  assert.equal(result.safeToProvision, true);
  assert.equal(result.planned.keyId, UNIJURI_DELEGATED_BINDING_PLANNED_KEY_ID);
  assert.equal(result.planned.minimumRsaBits, 2048);
  assert.equal(result.checks.find((c) => c.id === "keychain_item_present").detail, "absent");
});

test("UniJuri keychain preflight never requests the secret value", async () => {
  const calls = [];
  const execFn = async (command, args = []) => {
    calls.push([command, [...args]]);
    const error = new Error("not present");
    error.code = 44;
    throw error;
  };

  await collectUniJuriRemoteSignerKeychainPreflight({
    platform: "darwin",
    arch: "x64",
    nodePath: "/opt/homebrew/bin/node",
    accessFn: async () => {},
    execFn,
  });

  const keychainCall = calls.find(([command]) => command === "/usr/bin/security");
  assert.ok(keychainCall);
  assert.equal(keychainCall[1].includes("-w"), false);
  assert.equal(keychainCall[1].includes("-g"), false);
});

test("UniJuri keychain preflight fails hard off macOS or without security binary", async () => {
  const result = await collectUniJuriRemoteSignerKeychainPreflight({
    platform: "linux",
    arch: "x64",
    nodePath: "/usr/bin/node",
    accessFn: async () => {
      throw new Error("missing");
    },
    execFn: fakeExec(),
  });

  assert.equal(result.safeToProvision, false);
  assert.equal(result.writesPerformed, false);
  assert.equal(result.checks.find((c) => c.id === "platform").ok, false);
  assert.equal(result.checks.find((c) => c.id === "security_binary").ok, false);
});

test("read-only assertion rejects mutated UniJuri result", () => {
  assert.throws(
    () =>
      assertUniJuriRemoteSignerKeychainPreflightIsReadOnly({
        mode: "dry-run-read-only",
        writesPerformed: true,
      }),
    /unijuri_remote_signer_preflight_not_read_only/,
  );
});
