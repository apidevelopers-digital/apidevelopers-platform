
import assert from "node:assert/strict";
import test from "node:test";

import {
  attachTrustFaceAccessDurablePreviewToGateway,
  createTrustFaceAccessDurableRuntimeTransform,
} from "../src/trust-face-access-durable-runtime-transform.mjs";

function createGateway() {
  return Object.freeze({
    app: Object.freeze({
      handleRequest() {
        return { status: 200, headers: {}, body: "{\"ok\":true}" };
      },
    }),
    readiness: { check() { return { status: "ready" }; } },
    store: {},
  });
}

async function readStatus(gateway) {
  const response = await gateway.app.handleRequest({
    method: "GET",
    url: "https://gateway.apidevelopers.digital/v1/trust/face-access/status",
  });
  assert.equal(response.status, 200);
  return JSON.parse(response.body);
}

test("Trust Face Access durable runtime transform reports diagnostics when durable mode is disabled", async () => {
  const gateway = createGateway();
  const transformed = attachTrustFaceAccessDurablePreviewToGateway({
    gateway,
    env: {},
    cwd: "/s'ntime",
    config: { stateFilePath: "/runtime/state.json" },
  });

  assert.notEqual(transformed, gateway);
  const status = await readStatus(transformed);

  assert.equal(status.status, "preview");
  assert.equal(status.diagnostics.transformAttached, true);
  assert.equal(status.diagnostics.durableRuntimeEnabled, false);
  assert.equal(status.diagnostics.envFlagEnabled, false);
  assert.equal(status.diagnostics.cwd, "/runtime");
  assert.equal(status.diagnostics.fileFlagPath, "/.trust-face-access-durable-preview");
});

test("Trust Face Access durable runtime transform attaches durable service when enabled", async () => {
  const gateway = createGateway();
  const createdStores = [];
  const createdServices = [];

  const runtime = createTrustFaceAccessDurableRuntimeTransform({
    env: {
      TRUST_FACE_ACCESS_DURABLE_PREVIEW: "1",
      TRUST_FACE_ACCESS_DURABLE_STORE_FILE: ".var/trust-face.json",
      TRUST_FACE_ACCESS_RP_ID: "apidevelopers.digital",
      TRUST_FACE_ACCESS_ORIGIN: "https://trust.apidevelopers.digital",
    },
    cwd: "/runtime",
    config: { stateFilePath: "/should-not-be-used/state.json" },
    createStore(options) {
      createdStores.push(options);
      return { type: "file-store", path: options.path };
    },
    createService(options) {
      createdServices.push(options);
      return Object.freeze({
        status() {
          return {
            service: "trust-face-access",
            status: "durable_preview",
          };
        },
      });
    },
  });

  const transformed = attachTrustFaceAccessDurablePreviewToGateway({
    gateway,
    runtime,
  });

  assert.notEqual(transformed, gateway);
  assert.equal(transformed.trustFaceAccessDurablePreview.storePath, "/runtime/.var/trust-face.json");
  assert.equal(transformed.trustFaceAccessDurablePreview.status.service, "trust-face-access");
  assert.equal(transformed.trustFaceAccessDurablePreview.status.status, "durable_preview");
  assert.equal(transformed.trustFaceAccess.status().status, "durable_preview");
  assert.equal(createdStores.length, 1);
  assert.equal(createdStores[0].path, "/runtime/.var/trust-face.json");
  assert.equal(createdServices.length, 1);
  assert.equal(createdServices[0].store.type, "file-store");

  const status = await readStatus(transformed);
  assert.equal(status.status, "durable_preview");
  assert.equal(status.diagnostics.transformAttached, true);
});

test("Trust Face Access durable runtime uses gateway state file as default path", () => {
  const runtime = createTrustFaceAccessDurableRuntimeTransform({
    env: { TRUST_FACE_ACCESS_DURABLE_PREVIEW: "true" },
    cwd: "/runtime",
    config: { stateFilePath: "/runtime/state.json" },
    createStore(options) {
      return { path: options.path };
    },
    createService(options) {
      return { store: options.store, status() { return { status: "durable_preview" }; } };
    },
  });

  assert.equal(runtime.storePath, "/runtime/state.json.trust-face-access.json");
});

test("Trust Face Access durable runtime resolves domain root from Hostinger hbuilds cwd", async () => {
  const runtime = createTrustFaceAccessDurableRuntimeTransform({
    env: { TRUST_FACE_ACCESS_DURABLE_PREVIEW: "1" },
    cwd: "/home/u242521810/domains/gateway.apidevelopers.digital/hbuilds/current/nodejs",
    createStore(options) {
      return { path: options.path };
    },
    createService(options) {
      return { store: options.store, status() { return { status: "durable_preview" }; } };
    },
  });

  assert.equal(
    runtime.storePath,
    "/home/u242521810/domains/gateway.apidevelopers.digital/public_html/.trust-face-access-durable-store.json",
  );

  const transformed = attachTrustFaceAccessDurablePreviewToGateway({
    gateway: createGateway(),
    runtime,
    env: { TRUST_FACE_ACCESS_DURABLE_PREVIEW: "1" },
    cwd: "/home/u242521810/domains/gateway.apidevelopers.digital/hbuilds/current/nodejs",
  });

  const status = await readStatus(transformed);
  assert.equal(
    status.diagnostics.fileFlagPath,
    "/home/u242521810/domains/gateway.apidevelopers.digital/public_html/.trust-face-access-durable-preview",
  );
});
