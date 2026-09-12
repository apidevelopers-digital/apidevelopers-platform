import assert from "node:assert/strict";
import test from "node:test";
import {
  EMBEDDDED_BASE_URL,
  createMitraEmbeddedLexTransport,
} from "../src/mitra-embedded-lex-transport.mjs";

test("embedded transport dispatches to local Lex provider", async () => {
  let captured = null;
  const transport = createMitraEmbeddedLexTransport({
    dispatch: async (input) => {
      captured = input;
      return {
        http: 200,
        payload: {
          ok: true,
          status: "ok",
          read_only: true,
          persistence: false,
          write_executed: false,
        },
      };
    },
  });

  const response = await transport.fetchImpl(
    `${EMBEDDDED_BASE_URL}/mitra/orchestrator/dispatch`,
    {
      method: "POST",
      body: JSON.stringify({
        path: "/v1/jurimetrics/search",
        payload: { tribunal: "tjsp", classe_codigo: 7 },
      }),
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.ok, true);
  assert.deepEqual(captured, {
    path: "/v1/jurimetrics/search",
    payload: { tribunal: "tjsp", classe_codigo: 7 },
  });
  assert.deepEqual(await response.json(), {
    ok: true,
    status: "ok",
    read_only: true,
    persistence: false,
    write_executed: false,
  });
});

test("embedded transport fails closed for unknown routes and invalid json", async () => {
  const transport = createMitraEmbeddedLexTransport({
    dispatch: async () => ({ http: 200, payload: { ok: true } }),
  });

  let response = await transport.fetchImpl(" https://wrong.invalid/dispatch".trim(), {
    method: "POST",
    body: "{}",
  });
  assert.equal(response.status, 404);
  assert.equal((await response.json()).write_executed, false);

  response = await transport.fetchImpl(
    `${EMBEDDDED_BASE_URL}/mitra/orchestrator/dispatch`,
    { method: "POST", body: "{" },
   );
  assert.equal(response.status, 400);
  assert.equal((await response.json()).status, "embedded_transport_invalid_json");
});

test("embedded transport converts dispatch failure to 502 fail-closed response", async () => {
  const transport = createMitraEmbeddedLexTransport({
    dispatch: async () => {
      throw new Error("boom");
    },
  });
  const response = await transport.fetchImpl(
    `${EMBEDDED_BASE_URL}/mitra/orchestrator/dispatch`,
    { method: "POST", body: "{}" },
  );
  assert.equal(response.status, 502);
  const payload = await response.json();
  assert.equal(payload.status, "embedded_transport_dispatch_failed");
  assert.equal(payload.database_write_allowed, false);
});
