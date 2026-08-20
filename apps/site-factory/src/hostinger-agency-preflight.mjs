import crypto from "node:crypto";

const DEFAULT_BASE_URL = "https://developers.hostinger.com";

function requiredString(name, value) {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`missing_or_invalid:${name}`);
  return value.trim();
}

function normalizeCoordinates(value) {
  if (!value || typeof value !== "object") return null;
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { latitude, longitude };
}

function normalizeDatacenters(payload) {
  const items = Array.isArray(payload) ? payload : Array.isArray(payload?.data) ? payload.data : Array.isArray(payload?.datacenters) ? payload.datacenters : [];
  return items.map((item) => ({
    code: requiredString("datacenter.code", item?.code),
    title: requiredString("datacenter.title", item?.title),
    coordinates: normalizeCoordinates(item?.coordinates),
  }));
}

export function createHostingerHostingPreflightReport({ orderReference, datacentersPayload, checkedAt = new Date().toISOString() }) {
  const orderRef = requiredString("orderReference", String(orderReference ?? ""));
  const datacenters = normalizeDatacenters(datacentersPayload);
  if (datacenters.length === 0) throw new Error("hostinger_hosting_datacenters_unavailable");

  const report = {
    schemaVersion: "1.2",
    kind: "hostinger-business-hosting-preview-preflight",
    mode: "read-only",
    executable: false,
    writesEnabled: false,
    provisioningEnabled: false,
    dnsEnabled: false,
    deployEnabled: false,
    checkedAt,
    provider: "hostinger",
    product: "business-web-hosting",
    orderReference: orderRef,
    endpoints: {
      datacenters: "/api/agency-hosting/v1/orders/{order_id}/datacenters",
      createWebsite: "/api/agency-hosting/v1/orders/{order_id}/websites/setups",
      nodeBuildFromArchive: "/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/from-archive",
    },
    intendedProvisioning: {
      target: "isolated-preview-website",
      runtime: "node-static",
      createsWebsite: false,
      connectsRepository: false,
      configuresDns: false,
      deploysArtifact: false,
      uploadsArchive: false,
    },
    datacenters,
    blockers: [],
    readyForProvisioningApproval: true,
  };

  const fingerprint = crypto.createHash("sha256").update(JSON.stringify(report)).digest("hex");
  return Object.freeze({ ...report, fingerprint });
}

export async function runHostingerHostingPreflight({ token, orderId, fetchImpl = fetch, baseUrl = DEFAULT_BASE_URL, checkedAt = new Date().toISOString() }) {
  const bearer = requiredString("HOSTINGER_API_TOKEN", token);
  const order = requiredString("HOSTINGER_HOSTING_ORDER_ID", String(orderId ?? ""));
  const url = new URL(`/api/agency-hosting/v1/orders/${encodeURIComponent(order)}/datacenters`, baseUrl);
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { accept: "application/json", "content-type": "application/json", authorization: `Bearer ${bearer}` },
  });
  const bodyText = await response.text();
  let payload;
  try { payload = bodyText ? JSON.parse(bodyText) : null; } catch { payload = { raw: bodyText }; }
  if (!response.ok) throw new Error(`hostinger_hosting_preflight_failed:${response.status}:${response.statusText}`);
  return createHostingerHostingPreflightReport({
    orderReference: `order-***${order.slice(-4)}`,
    datacentersPayload: payload,
    checkedAt,
  });
}

export const createHostingerAgencyPreflightReport = createHostingerHostingPreflightReport;
export const runHostingerAgencyPreflight = runHostingerHostingPreflight;
