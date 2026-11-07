import assert from "node:assert/strict";
import test from "node:test";

import {
  createBillingReadyApp,
  startBillingHttpServer,
} from "../src/saas-billing-server.mjs";

function baseApp() {
  return {
    async handleRequest() {
      return {
        status: 404,
        headers: { "content-type": "application/json; charset=utf-8" },
        body: JSON.stringify({ error: "not_found" }),
      };
    },
  };
}

test("billing server composes public checkout only when explicitly injected and preserves raw body", async (t) => {
  const calls = [];
  const publicBillingHttp = {
    async handle(input) {
      if (
        String(input.method).toUpperCase() !== "POST" ||
        input.pathname !== "/v1/public/billing/checkout-intents"
      ) {
        return null;
      }
      calls.push(input);
      return {
        status: 201,
        payload: {
          checkoutIntentId: "pub_gateway_1",
          status: "prepared",
          provider: "mercadopago",
          providerInvocationAllowed: false,
        },
      };
    },
  };

  const app = createBillingReadyApp({
    baseApp: baseApp(),
    publicBillingHttp,
  });
  const server = await startBillingHttpServer({ app });
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  }));

  const address = server.address();
  const raw = JSON.stringify({
    priceId: "imuni.pro.month.br",
    payerEmail: "cliente@example.com",
    surfaceId: "imuni-public",
    consentAccepted: true,
  });

  const response = await fetch(
    `http://127.0.0.1:${address.port}/v1/public/billing/checkout-intents`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: "https://imuni.sitedauni.com",
        "idempotency-key": "public:imuni:gateway:1",
      },
      body: raw,
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), {
    checkoutIntentId: "pub_gateway_1",
    status: "prepared",
    provider: "mercadopago",
    providerInvocationAllowed: false,
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].rawBody.toString("utf8"), raw);
  assert.equal(calls[0].headers.origin, "https://imuni.sitedauni.com");
});

test("public checkout route remains unexposed when public handler is not injected", async () => {
  const app = createBillingReadyApp({ baseApp: baseApp() });
  const result = await app.handleRequest({
    method: "POST",
    url: "/v1/public/billing/checkout-intents",
    headers: { origin: "https://imuni.sitedauni.com" },
    rawBody: Buffer.from("{}"),
  });

  assert.equal(result.status, 404);
  assert.deepEqual(JSON.parse(result.body), { error: "not_found" });
});

test("billing server rejects invalid public checkout composition", () => {
  assert.throws(
    () => createBillingReadyApp({
      baseApp: baseApp(),
      publicBillingHttp: {},
    }),
    /publicBillingHttp\.handle must be a function/,
  );
});
