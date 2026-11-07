import test from "node:test";
import assert from "node:assert/strict";

import { attachRetrievalOperationalRuntimeToGateway } from "../src/retrieval-operational-bootstrap.mjs";

test("default operational retrieval bootstrap needs no provider runtime while disabled", async () => {
  const gateway = Object.freeze({
    app: Object.freeze({
      async handleRequest() {
        return null;
      },
    }),
  });

  const result = attachRetrievalOperationalRuntimeToGateway({
    gateway,
    env: {},
  });

  assert.equal(result.app, gateway.app);
  assert.equal(result.retrievalOperational.featureFlag, "RETRIEVAL_ENABLED");
  assert.equal(result.retrievalOperational.enabled, false);
  assert.equal(result.retrievalOperational.status, "disabled");
  assert.deepEqual(result.retrievalOperational.connectorIds, []);
  assert.deepEqual(result.retrievalOperational.resolverIds, []);

  await assert.rejects(
    result.retrievalRuntime.search({ query: "must-not-run" }),
    (error) => error.code === "RETRIEVAL_RUNTIME_DISABLED",
  );
  await assert.rejects(
    result.retrievalRuntime.fetchContent({ objectId: "must-not-run" }),
    (error) => error.code === "RETRIEVAL_RUNTIME_DISABLED",
  );
});

test("setting RETRIEVAL_ENABLED=true without explicit runtime factory fails closed", () => {
  const gateway = Object.freeze({
    app: Object.freeze({
      async handleRequest() {
        return null;
      },
    }),
  });

  assert.throws(
    () =>
      attachRetrievalOperationalRuntimeToGateway({
        gateway,
        env: { RETRIEVAL_ENABLED: "true" },
      }),
    (error) => error.code === "RETRIEVAL_OPERATIONAL_WIRING_REQUIRED",
  );
});
