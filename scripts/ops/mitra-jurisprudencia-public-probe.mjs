const {
  EXPECTED_DEPLOY_SHA = "",
  GATEWAY_ORIGIN = "",
  ADA_MITRA_BRIDGE_TENANT_ID = "",
  ADA_MITRA_MCP_V1_READ_TOKEN = "",
  GH_TOKEN = "",
  PROBE_QUERY = "direito civil",
  PROBE_TRIBUNAL = "STJ",
  PROBE_LIMIT = "3",
} = process.env;

const REPO_API_REF_URL =
  "https://api.github.com/repos/apidevelopers-digital/apidevelopers-platform/git/ref/heads/deploy/hostinger-gateway-runtime";

function emit(key, value) {
  console.log(`MITRA_JURISPRUDENCIA_PUBLIC_PROBE_${key}=${String(value)}`);
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
    "api_key",
    "apikey ",
    "x-api-key",
  ]) {
    if (lower.includes(forbidden)) fail(`secret_like_text_detected:${forbidden.trim()}`);
  }

  for (const secret of [ADA_MITRA_MCP_V1_READ_TOKEN]) {
    if (secret && String(text).includes(secret)) {
      fail("raw_saved_token_detected_in_response");
    }
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

function buildProbeUrl() {
  const url = new URL("/v1/ada/mitra/legal/jurisprudencia", GATEWAY_ORIGIN);
  url.searchParams.set("q", PROBE_QUERY);
  url.searchParams.set("tribunal", PROBE_TRIBUNAL);
  url.searchParams.set("limit", PROBE_LIMIT);
  return url;
}

function validateResultShape(results) {
  if (!Array.isArray(results)) {
    fail("results_not_array");
    return;
  }

  emit("RESULT_COUNT", results.length);

  if (results.length < 1) {
    fail("empty_results");
    return;
  }

  const allowedKeys = new Set(["id", "title", "source", "url", "court", "date", "summary"]);
  const sources = [];

  for (const result of results.slice(0, 10)) {
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      fail("invalid_result_object");
      return;
    }

    for (const key of Object.keys(result)) {
      if (!allowedKeys.has(key)) {
        fail(`unexpected_result_field_${key}`);
        return;
      }
    }

    if (!result.title && !result.id) {
      fail("result_missing_title_or_id");
      return;
    }

    if (result.source) sources.push(String(result.source));
  }

  emit("RESULT_SOURCES", sources.slice(0, 5).map(safe).join(",") || "none");
}

async function probeJurisprudenciaRoute() {
  const url = buildProbeUrl();
  let response;
  let text = "";

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": ADA_MITRA_MCP_V1_READ_TOKEN,
        "x-tenant-id": ADA_MITRA_BRIDGE_TENANT_ID,
        "user-agent": "apidevelopers-platform/mitra-jurisprudencia-public-probe",
      },
    });
    text = await response.text();
  } catch (error) {
    fail(`fetch_failed_${error?.name || "unknown"}`);
    return;
  }

  assertNoSecretLikeText(text);

  emit("ROUTE_HTTP_STATUS", response.status);

  let body;
  try {
    body = JSON.parse(text);
  } catch {
    emit("ROUTE_PARSE", "invalid_json");
    fail(`unparseable_response_http_${response.status}`);
    return;
  }

  emit("ROUTE_OK", body.ok === true ? "true" : "false");
  emit("ROUTE_SERVICE", safe(body.service || "none"));
  emit("ROUTE_ADAPTER_ID", safe(body.adapterId || "none"));
  emit("ROUTE_EXECUTION_STATUS", safe(body.executionStatus || "none"));
  emit("ROUTE_ERROR", safe(body.error || body.reason || "none"));

  if (response.status !== 200) {
    fail(`http_${response.status}_${body.error || body.reason || "unmapped"}`);
    return;
  }

  if (body.ok !== true) {
    fail(`not_ok_${body.error || body.reason || "unmapped"}`);
    return;
  }

  if (body.adapterId !== "mitra.buscar_jurisprudencia") {
    fail(`unexpected_adapter_${body.adapterId || "none"}`);
    return;
  }

  if (body.writeExecuted !== false || body.rawSqlAllowed !== false || body.writeAllowed !== false) {
    fail("read_only_safety_flags_invalid");
    return;
  }

  validateResultShape(body.results);
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
  emit("QUERY", safe(PROBE_QUERY));
  emit("TRIBUNAL", safe(PROBE_TRIBUNAL));
  emit("LIMIT", safe(PROBE_LIMIT));

  await validateDeployRef();
  await probeJurisprudenciaRoute();

  if (process.exitCode) process.exit( process.exitCode );
  emit("RESULT", "jurisprudencia_public_probe_passed");
}

await main();
