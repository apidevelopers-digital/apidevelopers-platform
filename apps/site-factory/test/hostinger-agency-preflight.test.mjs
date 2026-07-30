import test from "node:test";
import assert from "node:assert/strict";

import {
  createHostingerAgencyPreflightReport,
  runHostingerAgencyPreflight,
} from "../src/hostinger-agency-preflight.mjs";

test("creates a deterministic read-only preflight report", () => {
  const input = {
    orderReference: "order-***0581",
    datacentersPayload: {
      data: [
        {
          code: "br-1",
          name: "Brazil",
          country_code: "BR",
          pinger_url: "https://example.invalid/ping",
        },
      ],
    },
    checkedAt: "2026-07-30T23:00:00.000Z",
  };

  const first = createHostingerAgencyPreflightReport(input);
  const second = createHostingerAgencyPreflightReport(input);

  assert.equal(first.mode, "read-only");
  assert.equal(first.executable, false);
  assert.equal(first.writesEnabled, false);
  assert.equal(first.provisioningEnabled, false);
  assert.equal(first.dnsEnabled, false);
  assert.equal(first.deployEnabled, false);
  assert.equal(first.intendedProvisioning.type, "node-static");
  assert.equal(first.intendedProvisioning.domain, null);
  assert.equal(first.fingerprint, second.fingerprint);
  assert.match(first.fingerprint, /^[a-f0-9]{64}$/);
});

test("uses GET only and never sends the token to output", async () => {
  const calls = [];
  const report = await runHostingerAgencyPreflight({
    token: "secret-token",
    orderId: "1009450581",
    checkedAt: "2026-07-30T23:00:00.000Z",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        text: async () =>
          JSON.stringify({
            data: [{ code: "br-1", name: "Brazil", country_code: "BR" }],
          }),
      };
    },
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
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
      runHostingerAgencyPreflight({
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
      createHostingerAgencyPreflightReport({
        orderReference: "order-***0581",
        datacentersPayload: { data: [] },
      }),
    /hostinger_agency_datacenters_unavailable/,
  );
});
