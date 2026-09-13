import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveUniCoPreviewCredentialFilePath,
  resolveUniCoPreviewOperationalEnv,
  runUniCoPreviewOperationalMain,
} from "../src/uni-account-preview-operational-server.mjs";

const HANDOFF = `Bearer ${"H".repeat(64)}`;
const ACCESS = `Bearer ${"A".repeat(64)}`;

test("environment S2S credentials win and the private file is not read", async () => {
  let reads = 0;
  const env = {
    UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: HANDOFF,
    UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION: ACCESS,
  };
  const resolved = await resolveUniCoPreviewOperationalEnv({
    env,
    home: "/home/preview",
    async readFileFn() {
      reads += 1;
      throw new Error("unexpected read");
    },
  });
  assert.equal(resolved.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, HANDOFF);
  assert.equal(resolved.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, ACCESS);
  assert.equal(reads, 0);
});

test("private runtime file provides both preview S2S credentials", async () => {
  const path = resolveUniCoPreviewCredentialFilePath({ env: {}, home: "/home/preview" });
  assert.equal(path, "/home/preview/domains/apidevelopers.digital/uni-preview-account-runtime/gateway.credentials.json");

  const resolved = await resolveUniCoPreviewOperationalEnv({
    env: {},
    home: "/home/preview",
    async readFileFn(readPath, encoding) {
      assert.equal(readPath, path);
      assert.equal(encoding, "utf8");
      return JSON.stringify({
        handoffRedeemerAuthorization: HANDOFF,
        accessContextAuthorization: ACCESS,
      });
    },
  });
  assert.equal(resolved.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, HANDOFF);
  assert.equal(resolved.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, ACCESS);
});

test("partial S2S env configuration fails closed", async () => {
  await assert.rejects(
    () => resolveUniCoPreviewOperationalEnv({
      env: { UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION: HANDOFF },
      home: "/home/preview",
      async readFileFn() {
        throw new Error("unexpected read");
      },
    }),
    /must be configured as a pair/,
  );
});

test("runner receives augumented env without exposing credentials in the result", async () => {
  let seenEnv;
  const result = await runUniCoPreviewOperationalMain({
    env: { UNI_CO_PREVIEW_RUNTIME_CREDENTIALS_FILE: "/private/gateway.json" },
    home: "/home/preview",
    async readFileFn() {
      return JSON.stringify({
        handoffRedeemerAuthorization: HANDOFF,
        accessContextAuthorization: ACCESS,
      });
    },
    async runner({ env }) {
      seenEnv = env;
      return Object.freeze({ ok: true });
    },
  });
  assert.deepEqual(result, { ok: true });
  assert.equal(seenEnv.UNI_CO_PREVIEW_HANDOFF_REDEEMER_AUTHORIZATION, HANDOFF);
  assert.equal(seenEnv.UNI_CO_PREVIEW_ACCESS_CONTEXT_AUTHORIZATION, ACCESS);
});
