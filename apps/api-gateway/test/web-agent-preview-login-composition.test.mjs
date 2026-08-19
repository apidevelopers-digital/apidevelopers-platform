import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createJsonFileStore } from "@apidevelopers/persistence-core";
import { createUniCoPreviewLoginComposition } from "../src/web-agent-preview-login-composition.mjs";

const fallbackApp = {
  handleRequest: async () => ({ status: 404, headers: {}, body: "{}" }),
};

test("preview login composition is fail-closed without explicit identity verifier or backend", () => {
  const composed = createUniCoPreviewLoginComposition({
    app: fallbackApp,
    store: {
      read: async () => null,
      transaction: async () => {},
    },
  });

  assert.equal(composed.enabled, false);
  assert.equal(composed.descriptor.reason, "identity_verifier_unavailable");
});

test("preview login composition automatically uses the explicit HTTPS identity backend", async () => {
  const dir = await mkdtemp(join(tmpdir(), "preview-login-comp-"));
  try {
    const store = createJsonFileStore({
      filePath: join(dir, "state.json"),
      fsync: false,
    });
    const calls = [];
    const composed = createUniCoPreviewLoginComposition({
      app: fallbackApp,
      store,
      identityBackendBaseUrl: "https://unico.sitedauni.com",
      identityFetchImpl: async (url, options) => {
        calls.push({ url: String(url), method: options.method });
        if (String(url).endsWith("/operator/v1/session/login")) {
          return {
            ok: false,
            status: 401,
            async text() {
              return JSON.stringify({ ok: false, error: "invalid_credentials" });
            },
          };
        }
        throw new Error("unexpected_call");
      },
    });

    assert.equal(composed.enabled, true);
    assert.equal(composed.descriptor.identityBackendConfigured, true);
    assert.equal(composed.descriptor.automaticProvisioning, false);
    assert.equal(composed.descriptor.transientOperatorSessionReturnedToBrowser, false);

    await assert.rejects(
      () =>
        composed.bootstrap.login({
          host: "unico-preview.apidevelopers.digital",
          email: "igor@example.com",
          password: "bad",
        }),
      /invalid_credentials/,
    );
    assert.equal(calls.length, 1);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
