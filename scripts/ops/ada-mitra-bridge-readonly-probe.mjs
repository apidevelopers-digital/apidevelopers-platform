#!/usr/bin/env node

const GATEWAY_ORIGIN = process.env.GATEWAY_ORIGIN || "";
const EXPECTED_SOURCE_SHA = process.env.EXPECTED_SOURCE_SHA || "";
const TOKEN = process.env.ADA_MITRA_BRIDGE_BEARER || "";
const TENANT_ID = process.env.ADA_MITRA_BRIDGE_TENANT_ID || "";

const endpoint = "/v1/ada/mitra/status";
const lines = [];
function emit(line) {
  lines.push(line);
  console.log(line);
}
function safe(value) {
  return String(value || "unmapped").slice(0, 120).replace(/[^a-zA-Z0-9_.:-]/g, "_");
}
function commandEscape(value) {
  return String(value).replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}
function annotate() {
  const safeLines = lines.join("\n");
  console.log(`::warning file=mitra-bridge-tenant-probe.txt,line=1,title=ADA Mitra Bridge Tenant Probe::${commandEscape(safeLines)}`);
}
function fail(message) {
  emit(`ADA_MITRA_BRIDGE_PROBE_FAILURE=${safe(message)}`);
  annotate();
  process.exit(1);
}

emit(`ADA_MITRA_BRIDGE_PROBE_SECRET_PRESENT=${TOKEN ? "true" : "false"}`);
emit(`ADA_MITRA_BRIDGE_PROBE_TENANT_PRESENT=${TENANT_ID ? "true" : "false"}`);

if (!TOKEN) fail("missing_secret_ADA_MITRA_BRIDGE_READ_TOKEN");
if (!TENANT_ID) fail("missing_secret_ADA_MITRA_BRIDGE_TENANT_ID");

if (EXPECTED_SOURCE_SHA !== "27093700631cc21423d2ce561a1dd99ad78e68b7") {
  fail("unexpected_expected_source_sha");
}

if (GATEWAY_ORIGIN !== "https://gateway.apidevelopers.digital") {
  fail("unexpected_gateway_origin");
}

async function request(name, headers, accept = "application/json") {
  const response = await fetch(`${GATEWAY_ORIGIN}${endpoint}`, {
    method: "GET",
    headers: {
      accept,
      ...headers,
      "user-agent": "apidevelopers-platform/ada-mitra-tenant-probe",
    },
  });

  const text = await response.text();
  emit(`ADA_MITRA_BRIDGE_PROBE_AUTH_STRATEGY=${name}`);
  emit(`ADA_MITRA_BRIDGE_PROBE_ENDPOINT=${endpoint}`);
  emit(`ADA_MITRA_BRIDGE_PROBE_HTTP_STATUS=${response.status}`);

  let reason = "unmapped";
  try {
    const body = JSON.parse(text);
    reason = safe(body.reason || body.error || body.code || body.message || body.status || "ok");
  } catch {
    reason = "unparseable_response";
  }
  emit(`ADA_MITRA_BRIDGE_PROBE_RESULT=${name}:http_${response.status}:${reason}`);

  if (response.status === 200) {
    emit(`ADA_MITRA_BRIDGE_PROBE_AUTH_CONFIRMED=${name}`);
    annotate();
    process.exit(0);
  }

  if (response.status === 403) {
    emit(`ADA_MITRA_BRIDGE_PROBE_AUTH_CONFIRMED=${name}`);
    emit(`ADA_MITRA_BRIDGE_PROBE_SCOPE_MISSING_OR_DENIED=true`);
    annotate();
    process.exit(0);
  }
}

await request("x_api_key_with_tenant", {
  "x-api-key": TOKEN,
  "x-tenant-id": TENANT_ID,
});

await request("authorization_bearer_with_tenant", {
  authorization: `Bearer ${TOKEN}`,
  "x-tenant-id": TENANT_ID,
});

fail("all_tenant_auth_strategies_http_401_or_unhandled");
