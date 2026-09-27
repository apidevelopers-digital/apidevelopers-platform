const {
  EXPECTED_DEPLOY_SHA = "",
  GATEWAY_ORIGIN = "",
  ADA_MITRA_BRIDGE_TENANT_ID = "",
  ADA_MITRA_MCP_V1_READ_TOKEN = "",
  GH_TOKEN = "",
} = process.env;

const REPO_API_REF_URL =
  "https://api.github.com/repos/apidevelopers-digital/apidevelopers-platform/git/ref/heads/deploy/hostinger-gateway-runtime";

const ROUTES = [
  "/v1/mitra/mcp/status",
  "/v1/mitra/mcp/capabilities",
];

function emit(key, value) {
  console.log(`MITRA_MCP_V1_PUBLIC_PROBE_${key}=${String(value)}`);
}

function safe(value) {
  return String(value ?? "unmapped")
    .slice(0, 180)
    .replace(/[^a-zA-Z0-9_.:/-]/g, "_");
}

function fail(message) {
  emit("FAILURE", safe(message));
  process.exitCode = 1;
}

function requiredEnv(name, value) {
  if (!value) fail(`missing_${name}`);
}

function assertNoSecretLikeText(text) {
  const lower = String(text).toLowerCase();
  for (const forbidden of [
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

  if (ADA_MITRA_MCP_V1_READ_TOKEN && String(text).includes(ADA_MITRA_MCP_V1_READ_TOKEN)) {
    fail("raw_saved_token_detected_in_response");
  }
}

async function validateDeployRef() {
  const response = await fetch(REPO_API_REF_URL, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${GH_TOKEN}`,
      "x-github-api-version": "2022-11-28",
    },
  });

  emit("GITHUB_REF_HTTP_STATUS", response.status);

  if (!response.ok) {
    fail(`github_ref_http_${response.status}`);
    return;
  }

  const body = await response.json();
  const actualSha = body?.object?.sha || "";
  emit("DEPLOY_SHA", actualSha);

  if (actualSha !== EXPECTED_DEPLOY_SHA) {
    fail(`deploy_sha_mismatch_${actualSha}`);
  }
}

async function probeRoute(route) {
  let response;
  let text = "";
  let body = {};

  try {
    response = await fetch(`${GATEWAY_ORIGIN}${route}`, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": ADA_MITRA_MCP_V1_READ_TOKEN,
        "x-tenant-id": ADA_MITRA_BRIDGE_TENANT_ID,
        "user-agent": "apidevelopers-platform/mitra-mcp-v1-public-saved-token-probe",
      },
    });
    text = await response.text();
  } catch (error) {
    fail(`fetch_failed_${route}_${error?.name || "unknown"}`);
    return;
  }

  assertNoSecretLikeText(text);

  try {
    body = JSON.parse(text);
  } catch {
    emit(`ROUTE_${route.replaceAll("/", "_")}_HTTP_STATUS`, response.status);
    emit(`ROUTE_${route.replaceAll("/", "_")}_PARSE`, "invalid_json");
    fail(`unparseable_response_${route}_http_${response.status}`);
    return;
  }

  emit(`ROUTE_${route.replaceAll("/", "_")}_HTTP_STATUS`, response.status);
  emit(`ROUTE_${route.replaceAll("/", "_")}_OK`, body.ok === true ? "true" : "false");
  emit(`ROUTE_${route.replaceAll("/", "_")}_SERVICE`, safe(body.service || "none"));
  emit(`ROUTE_${route.replaceAll("/", "_")}_ERROR`, safe(body.error || body.reason || "none"));

  if (response.status !== 200) {
    fail(`http_${response.status}_${route}_${body.error || body.reason || "unmapped"}`);
  }
  if (body.ok !== true) {
    fail(`not_ok_${route}_${body.error || body.reason || "unmapped"}`);
  }
  if (body.service !== "mitra-mcp") {
    fail(`unexpected_service_${route}_${body.service || "none"}`);
  }

  if (route.endsWith("/capabilities")) {
    const tools = Array.isArray(body.tools) ? body.tools : [];
    emit("CAPABILITIES_TOOL_COUNT", tools.length);
    if (!tools.includes("mitra.status")) fail("missing_tool_mitra_status");
    if (!tools.includes("mitra.capabilities")) fail("missing_tool_mitra_capabilities");
  }
}

async function main() {
  if (GATEWAY_ORIGIN !== "https://gateway.apidevelopers.digital") {
    fail("unexpected_gateway_origin");
  }

  requiredEnv("EXPECTED_DEPLOY_SHA", EXPECTED_DEPLOY_SHA);
  requiredEnv("GH_TOKEN", GH_TOKEN);
  requiredEnv("ADA_MITRA_BRIDGE_TENANT_ID", ADA_MITRA_BRIDGE_TENANT_ID);
  requiredEnv("ADA_MITRA_MCP_V1_READ_TOKEN", ADA_MITRA_MCP_V1_READ_TOKEN);

  emit("TENANT_PRESENT", ADA_MITRA_BRIDGE_TENANT_ID ? "true" : "false");
  emit("MCP_READ_TOKEN_PRESENT", ADA_MITRA_MCP_V1_READ_TOKEN ? "true" : "false");
  emit("SECRET_SOURCE", "ADA_MITRA_MCP_V1_READ_TOKEN");

  await validateDeployRef();

  for (const route of ROUTES) {
    await probeRoute(route);
  }

  if (process.exitCode) process.exit(process.exitCode);
  emit("RESULT", "public_saved_token_probe_passed");
}

await main();
