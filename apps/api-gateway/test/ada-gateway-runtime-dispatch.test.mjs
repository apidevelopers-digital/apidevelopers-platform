import assert from "node:assert/strict";
import test from "node:test";

import { parsePayload } from "../scripts/ada-gateway-runtime-dispatch.mjs";

const SHA = "f4eab0b4cdebc246bc5b59ac3d5697e186b4ef21";
const APPROVAL = "IGOR_APROVA_GATEWAY_RUNTIME_BRANCH_20260814";

function payload(overrides = {}) {
  return JSON.stringify({
    operation: "api_gateway_runtime_publish_pinned",
    expected_source_sha: SHA,
    approval: APPROVAL,
    approved_by: "Igor",
    requested_via: "ada-chat",
    ...overrides,
  });
}

test("resolves the single allowlisted Gateway runtime publish operation", () => {
  const resolved = parsePayload(payload());
  assert.equal(resolved.workflow, "api-gateway-runtime-publish-pinned.yml");
  assert.equal(resolved.expected_source_sha, SHA);
  assert.equal(resolved.approval, APPROVAL);
});

test("rejects unknown keys and wrong governance literals", () => {
  assert.throws(() => parsePayload(payload({ shell: "rm -rf /" })), /unsupported payload key/);
  assert.throws(() => parsePayload(payload({ approval: "siga" })), /approval literal mismatch/);
  assert.throws(() => parsePayload(payload({ approved_by: "Someone" })), /approved_by must be Igor/);
  assert.throws(() => parsePayload(payload({ requested_via: "manual" })), /requested_via must be ada-chat/);
});

test("rejects malformed or non-SHA source values", () => {
  assert.throws(() => parsePayload("not-json"), /not valid JSON/);
  assert.throws(() => parsePayload(payload({ expected_source_sha: "main" })), /40-character Git SHA/);
});
