
import {
  CREATE_ENDPOINT,
  validateCreateAuthorization,
} from "./hostinger-website-create-contract.mjs";

const LIST_ENDPOINT = "/api/hosting/v1/websites";

function required(name, value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function headers(token) {
  return {
    accept: "application/json",
    "content-type": "application/json",
    authorization: `Bearer ${required("HOSTINGER_API_TOKEN", token)}`,
  };
}

async function readResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

function normalize(payload) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
}

function findWebsite(websites, domain) {
  return websites.find(
    (item) =>
      typeof item?.domain === "string" &&
      item.domain.trim().toLowerCase() === domain,
  );
}

function sanitizeWebsite(item, fallbackDomain) {
  return {
    domain:
      typeof item?.domain === "string" && item.domain.trim()
        ? item.domain.trim().toLowerCase()
        : fallbackDomain,
    username:
      typeof item?.username === "string" && item.username.trim()
        ? item.username.trim()
        : null,
    orderId:
      item?.order_id === undefined || item.order_id === null
        ? null
        : String(item.order_id),
    isEnabled:
      typeof item?.is_enabled === "boolean" ? item.is_enabled : null,
  };
}

async function listWebsites({
  token,
  orderId,
  domain,
  fetchImpl,
  baseUrl,
}) {
  const url = new URL(LIST_ENDPOINT, baseUrl);
  url.searchParams.set("page", "1");
  url.searchParams.set("per_page", "100");
  url.searchParams.set("order_id", orderId);
  url.searchParams.set("domain", domain);

  const response = await fetchImpl(url, {
    method: "GET",
    headers: headers(token),
  });
  const payload = await readResponse(response);

  if (!response.ok) {
    throw new Error(
      `hostinger_list_websites_failed:${response.status}:${response.statusText}`,
    );
  }

  return normalize(payload);
}

async function postWebsite({ token, payload, fetchImpl, baseUrl }) {
  const response = await fetchImpl(new URL(CREATE_ENDPOINT, baseUrl), {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
  await readResponse(response);

  if (![200, 201, 202, 204].includes(response.status)) {
    throw new Error(
      `hostinger_create_website_failed:${response.status}:${response.statusText}`,
    );
  }
  return response.status;
}

export async function executeApprovedWebsiteCreation({
  token,
  draft,
  approval,
  expectedFingerprint,
  expectedRepository,
  fetchImpl = fetch,
  baseUrl = "https://developers.hostinger.com",
  now = new Date(),
  maxDraftAgeMs = 2 * 60 * 60 * 1000,
  pollAttempts = 10,
  pollDelayMs = 3000,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const { draftInfo, approvalInfo } = validateCreateAuthorization({
    draft,
    approval,
    expectedFingerprint,
    expectedRepository,
    now,
    maxDraftAgeMs,
  });

  const existing = findWebsite(
    await listWebsites({
      token,
      orderId: draftInfo.orderId,
      domain: draftInfo.domain,
      fetchImpl,
      baseUrl,
    }),
    draftInfo.domain,
  );

  if (existing) {
    return Object.freeze({
      outcome: "already_exists",
      hostingerPostExecuted: false,
      hostingerPostStatus: null,
      website: sanitizeWebsite(existing, draftInfo.domain),
      draftInfo,
      approvalInfo,
    });
  }

  let postStatus;
  try {
    postStatus = await postWebsite({
      token,
      payload: {
        domain: draftInfo.domain,
        order_id: draftInfo.orderId,
        datacenter_code: draftInfo.datacenterCode,
      },
      fetchImpl,
      baseUrl,
    });
  } catch (error) {
    const visible = findWebsite(
      await listWebsites({
        token,
        orderId: draftInfo.orderId,
        domain: draftInfo.domain,
        fetchImpl,
        baseUrl,
      }),
      draftInfo.domain,
    );
    if (visible) {
      return Object.freeze({
        outcome: "created_after_ambiguous_response",
        hostingerPostExecuted: true,
        hostingerPostStatus: null,
        website: sanitizeWebsite(visible, draftInfo.domain),
        draftInfo,
        approvalInfo,
      });
    }
    throw error;
  }

  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    if (attempt > 0) await sleep(pollDelayMs);
    const created = findWebsite(
      await listWebsites({
        token,
        orderId: draftInfo.orderId,
        domain: draftInfo.domain,
        fetchImpl,
        baseUrl,
      }),
      draftInfo.domain,
    );
    if (created) {
      return Object.freeze({
        outcome: "created",
        hostingerPostExecuted: true,
        hostingerPostStatus: postStatus,
        website: sanitizeWebsite(created, draftInfo.domain),
        draftInfo,
        approvalInfo,
      });
    }
  }

  return Object.freeze({
    outcome: "accepted_pending_visibility",
    hostingerPostExecuted: true,
    hostingerPostStatus: postStatus,
    website: {
      domain: draftInfo.domain,
      username: null,
      orderId: null,
      isEnabled: null,
    },
    draftInfo,
    approvalInfo,
  });
}
