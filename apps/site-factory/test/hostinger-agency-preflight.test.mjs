import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerHostingPreflightReport,
  runHostingerHostingPreflight,
} from "../src/hostinger-agency-preflight.mjs";

test("creates a deterministic read-only report from the current Agency Hosting datacenter model", () => {
  const input = {
    orderReference: "order-***0581",
    datacentersPayload: [{ code: "br-1", title: "Brazil", coordinates: { latitude: -23.55, longitude: -46.63 } }],
    checkedAt: "2026-07-31T00:40:00.000Z",
  };
  const first = createHostingerHostingPreflightReport(input);
  const second = createHostingerHostingPreflightReport(input);
  assert.equal(first.mode, "read-only");
  assert.equal(first.executable, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.provisioningEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.endpoints.datacenters, "/api/agency-hosting/v1/orders/{order_id}/datacenters");
  assert.equal(first.endpoints.createWebsite, "/api/agency-hosting/v1/orders/{order_id}/websites/setups");
  assert.deepEqual(first.datacenters[0], { code: "br-1", title: "Brazil", coordinates: { latitude: -23.55, longitude: -46.63 } });
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("uses only GET on the current Agency Hosting datacenters endpoint and never exposes the token", async () => {
  const calls = [];
  const report = await runHostingerHostingPreflight({
    token: "secret-token",
    orderId: "1009450581",
    checkedAt: "2026-07-31T00:40:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true, status: 200, statusText: "OK",
        text: async () => JSON.stringify({ data: [{ code: "br-1", title: "Brazil", coordinates: { latitude: -23.55, longitude: -46.63 } }] }),
      };
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].url, "https://developers.hostinger.com/api/agency-hosting/v1/orders/1009450581/datacenters");
  assert.equal(calls[0].options.headers.authorization, "Bearer secret-token");
  assert.equal(report.orderReference, "order-***0581");
  assert.doesNotMatch(JSON.stringify(report), /secret-token/);
});

test("rejects missing credentials before any API call", async () => {
  await assert.rejects(
    () => runHostingerHostingPreflight({ token: "", orderId: "1009450581", fetchImpl: async () => { throw new Error("must_not_call"); } }),
    /missing_or_invalid:HOSTINGER_API_TOKEN/,
  );
});

test("rejects empty datacenter capacity", () => {
  assert.throws(
    () => createHostingerHostingPreflightReport({ orderReference: "order-***0581", datacentersPayload: [] }),
    /hostinger_hosting_datacenters_unavailable/,
   );
});
