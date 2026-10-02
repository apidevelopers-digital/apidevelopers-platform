import test from "node:test";
import assert from "node:assert/strict";

import {
  attachMitraPublicResearchToGateway,
  createMitraPublicOperationalWrapper,
} from "../src/mitra-public-operational-wrapper.mjs";

function nullFacade() {
  return Object.freeze({
    configured: false,
    async handleRequest() {
      return null;
    },
  });
}

test("Mitra operational wrapper intercepts public jurisprudencia facade before base app", async () => {
  let delegated = 0;
  let jurisprudenciaFactoryCalled = 0;

  const app = {
    async handleRequest() {
      delegated += 1;
      return { status: 200, headers: {}, body: "base" };
    },
  };

  const wrapper = createMitraPublicOperationalWrapper({
    app,
    env: { MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL: "https://juridico.example.test" },
    facadeFactory: nullFacade,
    professionalFactory: nullFacade,
    jurisprudenciaFactory: ({ adaMitraBridge }) => {
      jurisprudenciaFactoryCalled += 1;
      assert.equal(adaMitraBridge, app);
      return Object.freeze({
        async handleRequest(request) {
          if (request.url === "/v1/mitra/public/jurisprudencia?q=tema") {
            return { status: 200, headers: {}, body: '{"ok":true}' };
          }
          return null;
        },
      });
    },
  });

  const response = await wrapper.app.handleRequest({
    method: "GET",
    url: "/v1/mitra/public/jurisprudencia?q=tema",
  });

  assert.equal(response.status, 200);
  assert.equal(response.body, '{"ok":true}');
  assert.equal(delegated, 0);
  assert.equal(jurisprudenciaFactoryCalled, 1);
  assert.equal(wrapper.jurisprudenciaDescriptor.enabled, true);
  assert.equal(wrapper.jurisprudenciaDescriptor.credentials, "server_side");
  assert.deepEqual(wrapper.jurisprudenciaDescriptor.routes, ["GET /v1/mitra/public/jurisprudencia"]);
});

test("Mitra gateway attachment exposes public jurisprudencia descriptor", async () => {
  const gateway = Object.freeze({
    app: {
      async handleRequest() {
        return { status: 200, headers: {}, body: "base" };
      },
    },
    readiness: { status: "ready" },
  });

  const attached = attachMitraPublicResearchToGateway({
    gateway,
    env: { MITRA_PUBLIC_RESEARCH_UPSTREAM_BASE_URL: "https://juridico.example.test" },
    facadeFactory: nullFacade,
    professionalFactory: nullFacade,
    jurisprudenciaFactory: () => Object.freeze({
      async handleRequest() {
        return null;
      },
    }),
  });

  assert.notEqual(attached.app, gateway.app);
  assert.equal(attached.readiness, gateway.readiness);
  assert.equal(attached.mitraPublicJurisprudencia.enabled, true);
  assert.equal(attached.mitraPublicJurisprudencia.writeExecuted, false);
});
