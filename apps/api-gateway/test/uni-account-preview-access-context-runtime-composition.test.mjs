import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";

import {
  createUniAccountPreviewAccessContextConsumerAuthenticator,
  createUniAccountPreviewAccessContextRuntimeComposition,
  UNI_ACCOUNT_PREVIEW_ACCESS_CONTEXT_CONSUMER_PRINCIPAL_ID,
} from "../src/uni-account-preview-access-context-runtime-composition.mjs";

function app() {
  return Object.freeze({
    async handleRequest() {
      return Object.freeze({
        status: 404,
        headers: Object.freeze({}),
        body: "{}",
      });
    },
  });
}

const AUTHORIZATION = `Bearer ${"A".repeat(48)}`;

test("access-context consumer auth is disabled without dedicated authorization", async () => {
  const authenticator =
    createUniAccountPreviewAccessContextConsumerAuthenticator();
  assert.equal(authenticator.configured, false);
  assert.equal(await authenticator.authenticate({}), null);
});

test("access-context consumer auth requires dedicated server credential", async () => {
  const authenticator =
    createUniAccountPreviewAccessContextConsumerAuthenticator({
      authorization: AUTHORIZATION,
    });

  assert.equal(authenticator.configured, true);
  assert.equal(
    await authenticator.authenticate({ authorization: "Bearer wrong" }),
    null,
  );

  const identity = await authenticator.authenticate({
    Authorization: AUTHORIZATION,
  });
  assert.equal(identity.role, "server");
  assert.equal(
    identity.principal.id,
    UNI_ACCOUNT_PREVIEW_ACCESS_CONTEXT_CONSUMER_PRINCIPAL_ID,
  );
  assert.deepEqual(identity.principal.scopes, [
    "account:access-context:resolve",
  ]);
});

test("access-context runtime stays disabled without dedicated consumer auth", () => {
  const composition = createUniAccountPreviewAccessContextRuntimeComposition({
    app: app(),
    enabled: true,
  });

  assert.equal(composition.enabled, false);
  assert.equal(composition.descriptor.consumerConfigured, false);
  assert.equal(composition.descriptor.runtimeAutoWiring, false);
  assert.equal(composition.descriptor.productionEnabled, false);
});

test("access-context runtime mounts preview resolver without exposing authorization", async () => {
  const directory = await mkdtemp(join(tmpdir(), "uni-access-context-runtime-"));
  try {
    const store = createJsonFileStore({
      filePath: join(directory, "state.json"),
      fsync: false,
    });
    const composition = createUniAccountPreviewAccessContextRuntimeComposition({
      app: app(),
      store,
      consumerAuthorization: AUTHORIZATION,
      enabled: true,
    });

    assert.equal(composition.enabled, true);
    assert.equal(typeof composition.resolver?.resolve, "function");
    assert.equal(composition.descriptor.consumerConfigured, true);
    assert.equal(composition.descriptor.runtimeAutoWiring, true);
    assert.equal(composition.descriptor.productionEnabled, false);
    assert.equal(
      JSON.stringify(composition.descriptor).includes(AUTHORIZATION),
      false,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
