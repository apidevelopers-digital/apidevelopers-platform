#!/usr/bin/env node

const GATEWAY_ORIGIN = process.env.GATEWAY_ORIGIN || "";
const EXPECTED_SOURCE_SHA = process.env.EXPECTED_SOURCE_SHA || "";
const TOKEN = process.env.ADA_MITRA_BRIDGE_BEARER || "";

const endpoints = [
  "/v1/ada/mitra/status",
  "/v1/ada/mitra/capabilities",
  "/v1/ada/mitra/connectors",
];

function safeReason(value) {
  return String(value || "unmapped")
    .slice(0, 120)
    .replace(/[^a-zA-Z0-9_.:-]/g, "_");
}

function fail(message) {
  console.log(`ADA_MITRA_BRIDGE_PROBE_FAILURE=${safeReason(message)}`);
  process.exit(1);
}

if (!TOKEN) {
  console.log("ADA_MITRA_BRIDGE_PROBE_SECRET_PRESENT=false");
  fail("missing_secret_ADA_MITRA_BRIDGE_READ_TOKEN");
}

console.log("ADA_MITRA_BRIDGE_PROBE_SECRET_PRESENT=true");

if (EXPECTED_SOURCE_SHA !== "27093700631cc21423d2ce561a1dd99ad78e68b7") {
  fail("unexpected_expected_source_sha");
}

if (GATEWAY_ORIGIN !== "https://gateway.apidevelopers.digital") {
  fail("unexpected_gateway_origin");
}

async function request(path, accept = "application/json") {
  const url = `${GATEWAY_ORIGIN}${path}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept,
      authorization: `Bearer ${TOKEN}`,
      "user-agent": "apidevelopers-platform/ada-mitra-bridge-readonly-probe",
    },
  });

  const text = await response.text();
  return { status: response.status, text };
}

function assertNoSecretLikeText(endpoint, text) {
  const lower = text.toLowerCase();
  for (const forbidden of [
    "bearer ",
    "password",
    "access_token",
    "refresh_token",
    "cookie",
    "database_url",
    "private_key",
  ]) {
    if (lower.includes(forbidden)) {
      fail(`secret_like_field_exposed:${endpoint}:${forbidden.trim()}`);
    }
  }
}

function parseJson(endpoint, status, text) {
  try {
    return JSON.parse(text);
  } catch {
    console.log(`ADA_MITRA_BRIDGE_PROBE_ENDPOINT=${endpoint}`);
    console.log(`ADA_MITRA_BRIDGE_PROBE_HTTP_STATUS=${status}`);
    fail(`${endpoint}:http_${status}:unparseable_response`);
  }
}

for (const endpoint of endpoints) {
  const { status, text } = await request(endpoint);
  console.log(`ADA_MITRA_BRIDGE_PROBE_ENDPOINT=${endpoint}`);
  console.log(`ADA_MITRA_BRIDGE_PROBE_HTTP_STATUS=${status}`);

  assertNoSecretLikeText(endpoint, text);

  const body = parseJson(endpoint, status, text);
  if (status !== 200) {
    const reason = safeReason(body.reason || body.error || body.code || body.message || "unmapped");
    fail(`${endpoint}:http_${status}:${reason}`);
  }

  if (body.ok !== true) fail(`${endpoint}:not_ok`);
  if (body.service !== "ada-mitra-bridge") fail(`${endpoint}:unexpected_service`);

  if (endpoint.endsWith("/status")) {
    if (body.status !== "ready") fail("status_not_ready");
    if (body.mode !== "read_only_skeleton") fail("unexpected_mode");
    if (body.dataAccess?.liveDatabaseConnected !== false) fail("live_database_connected");
    if (body.dataAccess?.rawSqlAllowed !== false) fail("raw_sql_allowed");
    if (body.dataAccess?.writeAllowed !== false) fail("write_allowed");
  }

  if (endpoint.endsWith("/capabilities")) {
    const paths = new Set((body.capabilities || []).map((cap) => cap.path));
    for (const required of endpoints) {
      if (!paths.has(required)) fail(`missing_capability:${required}`);
    }
    if (!(body.unavailableUntilApproved || []).includes("raw_sql")) {
      fail("raw_sql_not_marked_unavailable");
    }
  }

  if (endpoint.endsWith("/connectors")) {
    if (body.connectorCount !== 0) fail("unexpected_connector_count");
    if (body.liveDatabaseConnected !== false) fail("connector_live_database_connected");
    if (body.credentialsConfigured !== false) fail("connector_credentials_configured");
    if (body.rawSqlAllowed !== false) fail("connector_raw_sql_allowed");
    if (body.writeAllowed !== false) fail("connector_write_allowed");
  }

  console.log(`ADA_MITRA_BRIDGE_PROBE_OK ${endpoint}`);
}

const source = await request("/SOURCE_SHA", "text/plain");
if (source.status === 200) {
  if (!source.text.includes(EXPECTED_SOURCE_SHA)) fail("source_sha_mismatch");
  console.log("ADA_MITRA_BRIDGE_SOURCE_SHA_CONFIRMED");
} else {
  console.log(`ADA_MITRA_BRIDGE_SOURCE_SHA_ENDPOINT_UNAVAILABLE_STATUS_${source.status}`);
}
