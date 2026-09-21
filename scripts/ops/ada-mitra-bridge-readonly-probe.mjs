#!/usr/bin/env node
const origin = process.env.GATEWAY_ORIGIN || "";
const token = process.env.ADA_MITRA_BRIDGE_BEARER || "";
const lines = [];
const emit = (s) => { lines.push(s); console.log(s); };
const esc = (s) => String(s).replace(/%/g,"%25").replace(/\r/g,"%0D").replace(/\n/g,"%0A");
const annotate = () => console.log(`::warning file=mitra-bridge-probe.txt,line=1,title=ADA Mitra Bridge Probe::${esc(lines.join("\n"))}`);
const safe = (s) => String(s || "unmapped").slice(0,120).replace(/[^a-zA-Z0-9_.:-]/g,"_");
async function call(name, headers) {
  const r = await fetch(`${origin}/v1/ada/mitra/status`, {method:"GET", headers:{accept:"application/json", ...headers, "user-agent":"apidevelopers-platform/ada-mitra-header-detect"}});
  const text = await r.text();
  emit(`ADA_MITRA_BRIDGE_PROBE_AUTH_STRATEGY=${name}`);
  emit(`ADA_MITRA_BRIDGE_PROBE_ENDPOINT=/v1/ada/mitra/status`);
  emit(`ADA_MITRA_BRIDGE_PROBE_HTTP_STATUS=${r.status}`);
  if (r.status !== 401) {
    let reason = "";
    try { const body = JSON.parse(text); reason = safe(body.reason || body.error || body.code || body.message || body.status || "ok"); } catch { reason = "unparseable_response"; }
    emit(`ADA_MITRA_BRIDGE_PROBE_RESULT=${name}:http_${r.status}:${reason}`);
    annotate();
    process.exit(0);
  }
}
emit(`ADA_MITRA_BRIDGE_PROBE_SECRET_PRESENT=${token ? "true" : "false"}`);
if (!token) { emit("ADA_MITRA_BRIDGE_PROBE_FAILURE=missing_secret_ADA_MITRA_BRIDGE_READ_TOKEN"); annotate(); process.exit(1); }
await call("authorization_bearer", {authorization:`Bearer ${token}`});
await call("x_api_key", {"x-api-key":token});
emit("ADA_MITRA_BRIDGE_PROBE_FAILURE=all_auth_strategies_http_401");
annotate();
process.exit(1);
