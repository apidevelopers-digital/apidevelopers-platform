import { spawnSync } from "node:child_process";

const env = process.env;
const origin = env.GATEWAY_ORIGIN || "";
const expectedSourceSha = env.EXPECTED_SOURCE_SHA || "";
const operatorKey = env.API_GATEWAY_OPERATOR_KEY || "";
const tenantId = env.ADA_MITRA_BRIDGE_TENANT_ID || "";
const org = env.ORG || "";
const repoName = env.REPO_NAME || "";
const scopes = ["ada:mitra:read", "mitra:status:read", "mitra:capabilities:read"];
const secretTargets = Object.freeze([
  "ADA_MITRA_BRIDGE_READ_TOKEN",
  "ADA_MITRA_MCP_V1_READ_TOKEN",
]);

const emit = (key, value) => console.log(`GATEWAY_KEY_PROVISIONER_REAL_${key}=${String(value)}`);
const safe = (value) => String(value ?? "unmapped").slice(0, 180).replace(/[^a-zA-Z0-9_.:-]/g, "_");
const fail = (message) => {
  emit("FAILURE", safe(message));
  process.exit(1);
};

function assertNoSecretLikeText(text) {
  const lower = String(text).toLowerCase();
  for (const forbidden of [
    "api_gateway_operator_key",
    "authorization",
    "bearer ",
    "cookie",
    "password",
    "private_key",
    "access_token",
    "refresh_token",
  ]) {
    if (lower.includes(forbidden)) fail(`secret_like_text_detected:${forbidden.trim()}`);
  }
}

function requireValue(name, value) {
  if (!value) fail(`missing_${name}`);
}

function assertScopes(actualScopes) {
  if (!Array.isArray(actualScopes)) fail("issue_scopes_missing");
  for (const scope of scopes) {
    if (!actualScopes.includes(scope)) fail(`issue_missing_scope_${scope}`);
  }
}

function storeSecret(secretName, secret) {
  const gh = spawnSync("gh", [
    "secret",
    "set",
    secretName,
    "--org",
    org,
    "--repos",
    repoName,
    "--body",
    secret,
  ], { encoding: "utf8" });

  if (gh.status !== 0) fail(`github_org_secret_store_failed_${secretName}:${safe(gh.stderr || gh.stdout || "no_output")}`);
  emit(`SECRET_STORED_${secretName}`, "true");
}

async function verifyRoute({ path, secret, expectedService }) {
  const response = await fetch(`${origin}${path}`, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-api-key": secret,
      "x-tenant-id": tenantId,
      "user-agent": "apidevelopers-platform/gateway-key-provisioner-real-issue-store-verify",
    },
  });
  const text = await response.text();
  assertNoSecretLikeText(text);

  let body = {};
  try {
    body = JSON.parse(text);
  } catch {
    fail(`verify_unparseable_${path}_http_${response.status}`);
  }

  const routeKey = path.replaceAll("/", "_");
  emit(`VERIFY_ROUTE_${routeKey}_HTTP_STATUS`, response.status);
  emit(`VERIFY_ROUTE_${routeKey}_OK`, body.ok === true ? "true" : "false");
  emit(`VERIFY_ROUTE_${routeKey}_SERVICE`, safe(body.service || "none"));
  emit(`VERIFY_ROUTE_${routeKey}_ERROR`, safe(body.error || body.reason || "none"));

  if (response.status !== 200) fail(`verify_${path}_http_${response.status}:${body.error || body.reason || "unmapped"}`);
  if (body.ok !== true) fail(`verify_${path}_not_ok:${body.error || body.reason || "unmapped"}`);
  if (expectedService && body.service !== expectedService) fail(`verify_${path}_unexpected_service:${body.service || "none"}`);
  return body;
}

if (origin !== "https://gateway.apidevelopers.digital") fail("unexpected_gateway_origin");
requireValue("EXPECTED_SOURCE_SHA", expectedSourceSha);
requireValue("API_GATEWAY_OPERATOR_KEY", operatorKey);
requireValue("ADA_MITRA_BRIDGE_TENANT_ID", tenantId);
requireValue("ORG", org);
requireValue("REPO_NAME", repoName);

emit("OPERATOR_KEY_PRESENT", "true");
emit("TENANT_PRESENT", "true");
emit("SECRET_TARGET", "organization_secret");
emit("SECRET_TARGETS", secretTargets.join(","));
emit("REQUESTED_SCOPES", scopes.join(","));

const sourceResponse = await fetch(`${origin}/SOURCE_SHA`, { headers: { accept: "text/plain" } });
const sourceText = await sourceResponse.text();
emit("SOURCE_SHA_HTTP_STATUS", sourceResponse.status);
if (sourceResponse.status === 200) {
  if (!sourceText.includes(expectedSourceSha)) fail("source_sha_mismatch");
  emit("SOURCE_SHA_CONFIRMED", "true");
} else if (sourceResponse.status === 404) {
  emit("SOURCE_SHA_CONFIRMED", "skipped_unavailable_404");
} else {
  fail(`source_sha_http_${sourceResponse.status}`);
}

const issueResponse = await fetch(`${origin}/v1/operator/api-keys/issue`, {
  method: "POST",
  headers: {
    accept: "application/json",
    "content-type": "application/json",
    "x-api-key": operatorKey,
    "user-agent": "apidevelopers-platform/gateway-key-provisioner-real-issue-store",
  },
  body: JSON.stringify({
    mode: "real",
    tenantId,
    name: "ada-mitra-bridge-read",
    scopes,
    reason: "ADA Mitra Bridge and Mitra MCP v1 read-only key issuance",
    confirmation: "IGOR_APROVA_GATEWAY_KEY_PROVISIONER_REAL",
  }),
});

const issueText = await issueResponse.text();
assertNoSecretLikeText(issueText.replace(/"secret"\s*:\s*"[^"]+"/g, "\"secret\":\"***\""));
emit("ISSUE_HTTP_STATUS", issueResponse.status);

let issueBody = {};
try {
  issueBody = JSON.parse(issueText);
} catch {
  fail(`unparseable_issue_response_http_${issueResponse.status}`);
}

emit("ISSUE_OK", issueBody.ok === true ? "true" : "false");
emit("ISSUE_ERROR", safe(issueBody.error || "none"));
emit("ISSUE_MODE", issueBody.mode || "missing");
emit("ISSUE_NAME", issueBody.name || "missing");
emit("ISSUE_SECRET_RETURNED", issueBody.secretReturned === true ? "true" : "false");
emit("ISSUE_SCOPES", Array.isArray(issueBody.scopes) ? issueBody.scopes.join(",") : "missing");
emit("ISSUE_PREFIX", safe(issueBody.prefix || "missing"));
emit("ISSUE_STATUS", safe(issueBody.status || "missing"));

if (issueResponse.status !== 201) fail(`issue_http_${issueResponse.status}:${issueBody.error || "unmapped"}`);
if (issueBody.ok !== true) fail("issue_not_ok");
if (issueBody.mode !== "real") fail("issue_unexpected_mode");
if (issueBody.name !== "ada-mitra-bridge-read") fail("issue_unexpected_name");
assertScopes(issueBody.scopes);
if (issueBody.secretReturned !== true) fail("issue_secret_not_returned");
if (!issueBody.secret || typeof issueBody.secret !== "string") fail("issue_missing_secret_value");

console.log(`::add-mask::${issueBody.secret}`);

for (const secretName of secretTargets) {
  storeSecret(secretName, issueBody.secret);
}

emit("SECRET_STORED", "true");
emit("SECRET_TARGET", "organization_secret");

await verifyRoute({ path: "/v1/ada/mitra/status", secret: issueBody.secret, expectedService: "ada-mitra-bridge" });
await verifyRoute({ path: "/v1/mitra/mcp/status", secret: issueBody.secret, expectedService: "mitra-mcp" });
const capabilities = await verifyRoute({ path: "/v1/mitra/mcp/capabilities", secret: issueBody.secret, expectedService: "mitra-mcp" });

const tools = Array.isArray(capabilities.tools) ? capabilities.tools : [];
emit("MITRA_MCP_CAPABILITIES_TOOL_COUNT", tools.length);
if (!tools.includes("mitra.status")) fail("mitra_mcp_missing_tool_status");
if (!tools.includes("mitra.capabilities")) fail("mitra_mcp_missing_tool_capabilities");

emit("RESULT", "real_key_issued_stored_as_org_secrets_and_verified_for_ada_mitra_and_mitra_mcp");
