import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL(
  "../../../.github/workflows/zuni-preview-governed-provisioning.yml",
  import.meta.url,
);

test("Zuni Preview governed provisioning workflow is fail-closed", async () => {
  const text = await readFile(workflowUrl, "utf8");

  assert.match(text, /runs-on:\s*\n\s*- self-hosted\s*\n\s*- macOS\s*\n\s*- X64/);
  assert.match(text, /GATEWAY_BASE_URL: https:\/\/gateway\.apidevelopers\.digital/);
  assert.match(text, /TENANT_SLUG: zuni-preview/);
  assert.match(text, /WORKSPACE_SLUG: preview-main/);
  assert.match(text, /PLAN_ID: pro/);
  assert.match(text, /MONTHLY_AMOUNT: "59700"/);
  assert.match(text, /CATALOG_SOURCE_SHA: 0ee7e4078ce3feb02306aa6641d06ec0afe32e69/);

  assert.match(text, /PROVISIONING_KEY: \$\{\{ secrets\.API_GATEWAY_PROVISIONING_KEY \}\}/);
  assert.match(text, /SUBJECT_REF: \$\{\{ secrets\.ZUNI_PREVIEW_SUBJECT_REF \}\}/);
  assert.doesNotMatch(text, /subjectRef:\s*\$\{\{ inputs\./);

  assert.match(text, /IGOR_APROVA_ZUNI_PREVIEW_PROVISION_DRY_RUN/);
  assert.match(text, /IGOR_APROVA_ZUNI_PREVIEW_PROVISION_WRITE/);
  assert.match(text, /if: \$\{\{ inputs\.mode == 'dry-run' \}\}/);
  assert.match(text, /"executed": False/);
  assert.match(text, /"writeAuthorized": False/);

  const writeStep = text.indexOf("Execute approved Zuni Preview provisioning");
  const post = text.indexOf("--request POST");
  assert.ok(writeStep >= 0 && post > writeStep, "POST must exist only in the approved write step");
  assert.match(text, /--header "x-api-key: \$PROVISIONING_KEY"/);
  assert.match(text, /\$GATEWAY_BASE_URL\/v1\/saas\/provision/);

  assert.match(text, /allowed = \(/);
  assert.match(text, /sanitized\["secretsExposed"\] = False/);
  assert.doesNotMatch(text, /print\(.*SUBJECT_REF/);
  assert.doesNotMatch(text, /print\(.*PROVISIONING_KEY/);
});
