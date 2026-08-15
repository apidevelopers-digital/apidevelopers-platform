import test from "node:test";
import assert from "node:assert/strict";

import {
  HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT,
  buildAgencyWebsiteSetupPayload,
  createAgencyWebsiteSetup,
  getAgencyWebsiteSetupStatus,
  waitForAgencyWebsiteSetup,
} from "../src/hostinger-agency-website-setup.mjs";

function response(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status >= 200 && status < 300 ? "OK" : "ERROR",
    text: async () => JSON.stringify(payload),
  };
}

test("builds the current Agency Hosting setup payload without deployment side effects", () => {
  assert.deepEqual(
    buildAgencyWebsiteSetupPayload({
      domain: "API.Example.com",
      datacenterCode: "us-east",
    }),
    {
      datacenter_code: "us-east",
      flavor: "php-fpm",
      settings: { php: { version: "8.3" } },
      domain: "api.example.com",
    },
  );
});

test("creates a setup and returns only the asynchronous setup UUID", async () => {
  const calls = [];
  const result = await createAgencyWebsiteSetup({
    token: "secret-token",
    orderId: "1009450581",
    payload: buildAgencyWebsiteSetupPayload({
      domain: "api.example.com",
      datacenterCode: "us-east",
    }),
    baseUrl: "https://developers.hostinger.test",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), method: options.method, body: options.body });
      return response({ setup_uuid: "0193b6d4-fabb-70e0-8ea4-cfe060a45898" }, 202);
    },
  });

  assert.equal(result.setupUuid, "0193b6d4-fabb-70e0-8ea4-cfe060a45898");
  assert.equal(calls[0].method, "POST");
  assert.equal(
    calls[0].url,
    "https://developers.hostinger.test/api/agency-hosting/v1/orders/1009450581/websites/setups",
  );
  assert.doesNotMatch(JSON.stringify(result), /secret-token/);
});

test("reads completed setup status and requires website_uid", async () => {
  const result = await getAgencyWebsiteSetupStatus({
    token: "secret-token",
    orderId: "1009450581",
    setupUuid: "0193b6d4-fabb-70e0-8ea4-cfe060a45898",
    baseUrl: "https://developers.hostinger.test",
    fetchImpl: async (url, options) => {
      assert.equal(options.method, "GET");
      assert.match(
        String(url),
        /\/api\/agency-hosting\/v1\/orders\/1009450581\/websites\/setups\/0193b6d4-fabb-70e0-8ea4-cfe060a45898$/,
      );
      return response({ status: "completed", website_uid: "zpwlGlp19" });
    },
  });

  assert.deepEqual(result, {
    status: "completed",
    websiteUid: "zpwlGlp19",
    completed: true,
  });
});

test("polls running setup until completed without a second POST", async () => {
  let reads = 0;
  const result = await waitForAgencyWebsiteSetup({
    token: "secret-token",
    orderId: "1009450581",
    setupUuid: "0193b6d4-fabb-70e0-8ea4-cfe060a45898",
    attempts: 3,
    delayMs: 0,
    sleep: async () => {},
    baseUrl: "https://developers.hostinger.test",
    fetchImpl: async (_url, options) => {
      assert.equal(options.method, "GET");
      reads += 1;
      return reads === 1
        ? response({ status: "running", website_uid: null })
        : response({ status: "completed", website_uid: "zpwlGlp19" });
    },
  });

  assert.equal(reads, 2);
  assert.equal(result.completed, true);
  assert.equal(result.websiteUid, "zpwlGlp19");
});

test("documents the exact asynchronous Hostinger contract", () => {
  assert.equal(
    HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT.createEndpoint,
    "/api/agency-hosting/v1/orders/{order_id}/websites/setups",
  );
  assert.equal(HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT.asynchronous, true);
  assert.equal(HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT.setupIdentifier, "setup_uuid");
  assert.equal(HOSTINGER_AGENCY_WEBSITE_SETUP_CONTRACT.websiteIdentifier, "website_uid");
});
