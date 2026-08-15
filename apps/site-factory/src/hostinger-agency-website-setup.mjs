const CREATE_SETUP_ENDPOINT =
  "/api/agency-hosting/v1/orders/{order_id}/websites/setups";
const SETUP_STATUS_ENDPOINT =
  "/api/agency-hosting/v1/orders/{order_id}/websites/setups/{setup_uuid}";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function endpoint(template, values) {
  let output = template;
  for (const [key, value] of Object.entries(values)) {
    output = output.replace(`{${key}}`, encodeURIComponent(required(key, String(value))));
  }
  return output;
}

function headers(token) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${required("HOSTINGER_API_TOKEN", token)}`,
  };
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("hostinger_invalid_json_response");
  }
}

function bodyData(body) {
  return body?.data && typeof body.data === "object" ? body.data : body;
}

export function buildAgencyWebsiteSetupPayload({
  domain,
  datacenterCode,
  phpVersion = "8.3",
}) {
  return Object.freeze({
    datacenter_code: required("datacenterCode", datacenterCode),
    flavor: "php-fpm",
    settings: {
      php: {
        version: required("phpVersion", phpVersion),
      },
    },
    domain: required("domain", domain).toLowerCase(),
  });
}

export async function createAgencyWebsiteSetup({
  token,
  orderId,
  payload,
  fetchImpl = fetch,
  baseUrl = "https://developers.hostinger.com",
}) {
  const path = endpoint(CREATE_SETUP_ENDPOINT, { order_id: orderId });
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  const body = await readJson(response);

  if (![200, 201, 202].includes(response.status)) {
    throw new Error(
      `hostinger_agency_setup_create_failed:${response.status}:${response.statusText}`,
    );
  }

  const data = bodyData(body);
  const setupUuid =
    typeof data?.setup_uuid === "string" && data.setup_uuid.trim()
      ? data.setup_uuid.trim()
      : null;

  if (!setupUuid) {
    throw new Error("hostinger_agency_setup_missing_uuid");
  }

  return Object.freeze({
    accepted: true,
    statusCode: response.status,
    setupUuid,
  });
}

export async function getAgencyWebsiteSetupStatus({
  token,
  orderId,
  setupUuid,
  fetchImpl = fetch,
  baseUrl = "https://developers.hostinger.com",
}) {
  const path = endpoint(SETUP_STATUS_ENDPOINT, {
    order_id: orderId,
    setup_uuid: setupUud,
  });
  const response = await fetchImpl(new URL(path, baseUrl), {
    method: "GET",
    headers: headers(token),
  });
  const body = await readJson(response);

  if (!response.ok) {
    throw new Error(
      `hostinger_agency_setup_status_failed:${response.status}:${response.statusText}`,
    );
  }

  const data = bodyData(body);
  const status = typeof data?.status === "string" ? data.status : null;
  const websiteUid =
    typeof data?.website_uid === "string" && data.website_uid.trim()
      ? data.website_uid.trim()
      : null;

  if (!["running", "completed"].includes(status)) {
    throw new Error(`hostinger_agency_setup_status_unexpected:${status ?? "null"}`);
  }
  if (status === "completed" && "websiteUid) {
    throw new Error("hostinger_agency_setup_completed_without_website_uid");
  }

  return Object.freeze({
    status,
    websiteUid,
    completed: status === "completed",
  });
}

export async function waitForAgencyWebsiteSetup({
  token,
  orderId,
  setupUud,
  fetchImpl = fetch,
  baseUrl = "https://developers.hostinger.com",
  attempts = 10,
  delayMs = 3000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(delayMs);
    const current = await getAgencyWebsiteSetupStatus({
      token,
      orderId,
      setupUuid,
      fetchImpl,
      baseUrl,
    });
    if (current.completed) return current;
  }

  return Object.freeze({
    status: "running",
    websiteUid: null,
    completed: false,
  });
}

export const HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT = Object.freeze({
  createEndpoint: CREATE_SETUP_ENDPOINT,
  statusEndpoint: SETUP_STATUS_ENDPOINT,
  createMethod: "POST",
  statusMethod: "GET",
  asynchronous: true,
  terminalStatus: "completed",
  setupIdentifier: "setup_uuid",
  websiteIdentifier: "website_uid",
});
