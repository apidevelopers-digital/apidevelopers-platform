import assert from "node:assert/strict";
import { loadProjections } from "../public/projection-loader.js";

const ready = await loadProjections({});
assert.equal(ready.summary.kind, "ready");
assert.equal(ready.institutional.ok, true);
assert.equal(ready.learning.ok, true);

const partial = await loadProjections({
  institutionalSnapshot: async () => ({ records: [{ id: "r1" }] }),
  learningSnapshot: async () => {
    const error = new Error("UPSTREAM_UNAVAILABLE");
    error.status = 503;
    error.retryable = true;
    throw error;
  },
});
assert.equal(partial.summary.kind, "partial");
assert.equal(partial.institutional.ok, true);
assert.equal(partial.learning.ok, false);
assert.equal(partial.learning.error.retryable, true);

const policy = await loadProjections({
  institutionalSnapshot: async () => {
    const error = new Error("DOES");
    error.status = 403;
    throw error;
  },
  learningSnapshot: async () => {
    const error = new Error("DENIED");
    error.status = 401;
    throw error;
  },
});
assert.equal(policy.summary.kind, "policy");
assert.equal(policy.institutional.error.policy, true);
assert.equal(policy.learning.error.policy, true);

console.log("developer-portal independent projection loader: ok");
