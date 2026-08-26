import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const MATERIALIZED = new URL("../src/global-trust-face-lab-live-runtime.mjs", import.meta.url);
const CANONICAL = new URL("../../../packages/trust-biometric-adapter-aws/src/live-runtime.mjs", import.meta.url);

test("materialized Face Lab live runtime remains byte-for-byte equal to the canonical adapter", async () => {
  const [materialized, canonical] = await Promise.all([
    readFile(MATERIALIZED),
    readFile(CANONICAL),
  ]);
  assert.deepEqual(materialized, canonical);
});
