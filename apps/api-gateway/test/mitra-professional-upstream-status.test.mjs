import test from "node:test";
import assert from "node:assert/strict";

import { createMitraProfessionalFacade } from "../src/mitra-professional-facade.mjs";

const ORIGIN = "https://mitra-preview.apidevelopers.digital";

function request(path, body) {
  return {
    method: "POST",
    url: path,
    headers: {
      origin: ORIGIN,
      "x-real-ip": "203.0.113.88"
    },
    body: JSON.stringify(body)
  };
}

function upstreamResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test("professional facade preserves safe upstream analyze status instead of masking it", async () => {
  const facade = createMitraProfessionalFacade({
    upstreamBaseUrl: "https://mitra-professional-orchestrator.example",
    upstreamBearer: "server-only",
    fetchImpl: async (_url, options) => {
      const sent = JSON.parse(options.body);
      assert.equal(sent.path, "/v1/analyze");
      assert.deepEqual(Object.keys(sent.payload).sort(), [
        "dry_run",
        "facts",
        "limit",
        "mode",
        "question",
        "read_only",
        "tribunal"
      ].sort());

      return upstreamResponse(503, {
        ok: false,
        status: "ai_not_configured",
        service: "lex-strategy-core",
        message: "AI strategy runtime is not configured.",
        readiness: {
          enabled: true,
          api_key_present: false,
          model_present: true,
          model: "gpt-4.1-mini"
        }
      });
    }
  });

  const response = await facade.handleRequest(request("/v1/mitra/professional/analyze", {
    question: "Quais pontos jurídicos exigem revisão humana?",
    facts: ["Fato operacional de teste."],
    tribunal: "STJ",
    limit: 3
  }));

  assert.equal(response.status, 502);
  const body = JSON.parse(response.body);
  assert.equal(body.ok, false);
  assert.equal(body.error, "ai_not_configured");
  assert.equal(body.message, "AI strategy runtime is not configured.");
  assert.equal(body.write_executed, false);
  assert.equal(body.database_write_allowed, false);
});
