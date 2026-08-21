import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL(
  "../../../.github/workflows/zuni-preview-provisioning-preflight.yml",
  import.meta.url,
);

test("Zuni Preview provisioning preflight is read-only and fail-closed", async () => {
  const text = await readFile(workflowUrl, "utf8");

  assert.match(text, /runs-on:\s*\n\s*- self-hosted\s*\n\s*- macOS\s*\n\s*- X64/);
  assert.match(text, /secrets\.API_GATEWAY_PROVISIONING_KEY/);
  assert.match(text, /secrets\.ZUNI_PREVIEW_SUBJECT_REF/);
  assert.match(text, /\$GATEWAY_BASE_URL\/ready/);

  assert.match(text, /"mode": "dry-run-preflight"/);
  assert.match(text, /"executed": False/);
  assert.match(text, /"writeAuthorized": False/);
  assert.match(text, /"secretsExposed": False/);

  assert.doesNotMatch(text, /--request\s+POST/);
  assert.doesNotMatch(text, /\/v1\/saas\/provision/);
  assert.doesNotMatch(text, /echo\s+["']?\$PROVISIONING_KEY/);
  assert.doesNotMatch(text, /echo\s+["']?\$SUBJECT_REF/);
});
