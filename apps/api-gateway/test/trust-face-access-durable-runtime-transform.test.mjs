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

test("Trust Face Access durable runtime transform is disabled by default", () => {
  const gateway = createGateway();
  const transformed = attachTrustFaceAccessDurablePreviewToGateway({
    gateway,
    env: {},
    cwd: "/runtime",
    config: { stateFilePath: "/runtime/state.json" },
  });

  assert.equal(transformed, gateway);
});

test("Trust Face Access durable runtime transform attaches only when enabled", () => {
  const gateway = createGateway();
  const createdStores = [];
  const createdServices = [];

  const transformed = attachTrustFaceAccessDurablePreviewToGateway({
    gateway,
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

  assert.notEqual(transformed, gateway);
  assert.equal(transformed.trustFaceAccessDurablePreview.storePath, "/runtime/.var/trust-face.json");
  assert.equal(transformed.trustFaceAccessDurablePreview.status.service, "trust-face-access");
  assert.equal(transformed.trustFaceAccessDurablePreview.status.status, "durable_preview");
  assert.equal(transformed.trustFaceAccess.status().status, "durable_preview");
  assert.deepEqual(createdStores, [{ path: "/runtime/.var/trust-face.json" }]);
  assert.equal(createdServices[0].store.type, "file-store");
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
