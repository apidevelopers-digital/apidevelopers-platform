import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createMercadoPagoHttpClient } from "../src/providers/mercadopago-client.mjs";

function response(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() { return JSON.stringify(payload); },
  };
}

function signature({ dataId, requestId, ts, secret }) {
  const manifest = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const v1 = createHmac("sha256", secret).update(manifest).digest("hex");
  return `ts=${ts},v1=${v1}`;
}

test("Mercado Pago HTTP client creates a recurring plan with bearer auth and idempotency", async () => {
  const calls = [];
  const client = createMercadoPagoHttpClient({
    accessToken: "fixture-token",
    webhookSecret: "fixture-secret",
    fetchImpl: async (url, options) => {
      calls.push({ url: String(url), options });
      return response(201, {
        id: "plan_1",
        init_point: "https://www.mercadopago.com.br/subscriptions/checkout?preapproval_plan_id=plan_1",
      });
    },
  });

  const result = await client.createSubscriptionPlan(
    {
      reason: "zuni master",
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: 1690,
        currency_id: "BRL",
      },
      back_url: "https://zuni.sitedauni.com/billing/success",
    },
    { idempotencyKey: "intent-1" },
  );

  assert.equal(result.id, "plan_1");
  assert.equal(calls[0].url, "https://api.mercadopago.com/preapproval_plan");
  assert.equal(calls[0].options.method, "POST");
  assert.equal(calls[0].options.headers.authorization, "Bearer fixture-token");
  assert.equal(calls[0].options.headers["x-idempotency-key"], "intent-1");
});

test("signed subscription webhook is verified and hydrated before normalization", async () => {
  const secret = "fixture-secret";
  const requestId = "req_1";
  const dataId = "pre_1";
  const ts = "1786442400";
  const calls = [];
  const client = createMercadoPagoHttpClient({
    accessToken: "fixture-token",
    webhookSecret: secret,
    fetchImpl: async (url) => {
      calls.push(String(url));
      return response(200, {
        id: "pre_1",
        status: "authorized",
        external_reference: "subscription:acme:zuni",
        payer_id: 42,
        last_modified: "2026-08-11T10:00:00.000Z",
      });
    },
  });

  const event = await client.verifyAndParseWebhook({
    headers: {
      "x-request-id": requestId,
      "x-signature": signature({ dataId, requestId, ts, secret }),
    },
    query: { "data.id": dataId },
    rawBody: Buffer.from(JSON.stringify({
      id: 9001,
      type: "subscription_preapproval",
      action: "updated",
      data: { id: dataId },
      date_created: "2026-08-11T09:59:00.000Z",
    })),
  });

  assert.equal(calls[0], "https://api.mercadopago.com/preapproval/pre_1");
  assert.equal(event.status, "authorized");
  assert.equal(event.external_reference, "subscription:acme:zuni");
  assert.equal(event.preapprovalId, "pre_1");
  assert.equal(event.payerId, "42");
});

test("invalid Mercado Pago webhook signature is rejected before resource fetch", async () => {
  let called = false;
  const client = createMercadoPagoHttpClient({
    accessToken: "fixture-token",
    webhookSecret: "fixture-secret",
    fetchImpl: async () => {
      called = true;
      return response(200, {});
    },
  });

  await assert.rejects(
    () => client.verifyAndParseWebhook({
      headers: {
        "x-request-id": "req_1",
        "x-signature": "ts=1786442400,v1=deadbeef",
      },
      query: { "data.id": "pre_1" },
      rawBody: JSON.stringify({
        type: "subscription_preapproval",
        data: { id: "pre_1" },
      }),
    }),
    /signature verification failed/,
  );
  assert.equal(called, false);
});
