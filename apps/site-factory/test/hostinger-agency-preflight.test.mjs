import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerHostingPreflightReport,
  runHostingerHostingPreflight,
} from "../src/hostinger-agency-preflight.mjs";

test("creates a deterministic read-only report from the official Business Hosting datacenter model", () => {
  const input = {
    orderReference: "order-***0581",
    datacentersPayload: [
      {
        code: "br-1",
        title: "Brazil",
        coordinates: { latitude: -23.55, longitude: -46.63 },
      },
    ],
    checkedAt: "2026-07-31T00:40:00.000Z",
  };

  const first = createHostingerHostingPreflightReport(input);
  const second = createHostingerHostingPreflightReport(input);

  assert.equal(first.kind, "hostinger-business-hosting-preview-preflight");
  assert.equal(first.product, "business-web-hosting");
  assert.equal(first.mode, "read-only");
  assert.equal(first.executable, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.provisioningEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.intendedProvisioning.createsWebsite, false);
  assert.equal(first.intendedProvisioning.uploadsArchive, false);
  assert.equal(
    first.endpoints.datacenters,
    "/api/hosting/v1/datacenters?order_id={order_id}",
  );
  assert.deepEqual(first.datacenters[0], {
    code: "br-1",
    title: "Brazil",
    coordinates: { latitude: -23.55, longitude: -46.63 },
  });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("uses only GET on the Business Hosting datacenters endpoint and never exposes the token", async () => {
  const calls = [];

  const report = await runHostingerHostingPreflight({
    token: "secret-token",
    orderId: "1009450581",
    checkedAt: "2026-07-31T00:40:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });

      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify([
            {
              code: "br-1",
              title: "Brazil",
              coordinates: { latitude: -23.55, longitude: -46.63 },
            },
          ]),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(
    calls[0].url,
    "https://developers.hostinger.com/api/hosting/v1/datacenters?order_id=1009450581",
  );
  assert.equal(
    calls[0].options.headers.authorization,
    "Bearer secret-token",
  );
  assert.equal(report.orderReference, "order-***0581");
  assert.doesNotMatch(JSON.stringify(report), /secret-token/);
});

test("rejects missing credentials before any API call", async () => {
  await assert.rejects(
    () =>
      runHostingerHostingPreflight({
        token: "",
        orderId: "1009450581",
        fetchImpl: async () => {
          throw new Error("must_not_call");
        },
      }),
    /missing_or_invalid:HOSTINGER_API_TOKEN/,
  );
});

test("rejects empty datacenter capacity", () => {
  assert.throws(
    () =>
      createHostingerHostingPreflightReport({
        orderReference: "order-***0581",
        datacentersPayload: [],
      }),
    /hostinger_hosting_datacenters_unavailable/,
  );
});
