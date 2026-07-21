
import assert from "node:assert/strict";
import { classifyResponseState } from "../public/contracts.js";

const matrix = [
  {
    name: "ready",
    input: { status: 200, hasData: true, meta: { stale: false } },
    expected: { kind: "ready", retryable: false },
  },
  {
    name: "empty",
    input: { status: 200, hasData: false, meta: { stale: false } },
    expected: { kind: "empty", retryable: false },
  },
  {
    name: "stale",
    input: { status: 200, hasData: true, meta: { stale: true } },
    expected: { kind: "stale", retryable: true },
  },
  {
    name: "unauthorized",
    input: { status: 401 },
    expected: { kind: "policy", retryable: false },
  },
  {
    name: "forbidden",
    input: { status: 403 },
    expected: { kind: "policy", retryable: false },
  },
  {
    name: "retryable error",
    input: { status: 503, error: { retryable: true } },
    expected: { kind: "error", retryable: true },
  },
  {
    name: "non-retryable error",
    input: { status: 400, error: { retryable: false } },
    expected: { kind: "error", retryable: false },
  },
];

for (const scenario of matrix) {
  assert.deepEqual(
    classifyResponseState(scenario.input),
    scenario.expected,
    scenario.name,
  );
}

console.log("developer-portal visual state matrix: ok");
