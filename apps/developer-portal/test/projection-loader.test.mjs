import assert from "node:assert/strict";
import { loadProjections } from "../public/projection-loader.js";

const ready = await loadProjections({\n  institutionalSnapshot: async () => ({ records: [] }),\n  learningSnapshot: async () => ({ memories: [] }),\n});
assert.equal(ready.summary.kind, "ready");
assert.equal(ready.institutional.ok, true);
assert.equal(ready.learning.ok, true);

const partial = await loadProjections({\n  institutionalSnapshot: async () => ({ records: [{ id: "r1" }] }),\n  learningSnapshot: async () => { const e=new Error("UPSTREAM_UNAVAILABLE"); e.status=503; e.retryable=true; throw e; },\n});
assert.equal(partial.summary.kind, "partial");
assert.equal(partial.institutional.ok, true);
assert.equal(partial.learning.ok, false);
assert.equal(partial.learning.error.retryable, true);

const policy = await loadProjections({\n  institutionalSnapshot: async () => { const e=new Error("DOES"); e.status=403; throw e; },\n  learningSnapshot: async () => { const e=new Error("DENIED"); e.status=401; throw e; },\n});
assert.equal(policy.summary.kind, "policy");
assert.equal(policy.institutional.error.policy, true);
assert.equal(policy.learning.error.policy, true);

console.log("developer-portal independent projection loader: ok");
