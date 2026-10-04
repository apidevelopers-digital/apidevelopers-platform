import test from "node:test";
import assert from "node:assert/strict";

import { createMitraProfessionalOrchestrator, __test } from "../../../packages/lex-legal-runtime/src/vendor/lex/src/mitra-orchestrator.js";

test("Mitra analyze evidence query seeds official retrieval with sanitized facts", () => {
  const query = __test.buildAnalyzeEvidenceQuery("Quais pontos revisar?", [
    "Responsabilidade civil médica em cirurgia eletiva.",
    { ignored: "objects are already normalized before this helper" },
    "Nexo causal discutido em prontuário e laudo pericial."
  ]);

  assert.match(query, /Quais pontos revisar/);
  assert.match(query, /Responsabilidade civil médica/);
  assert.match(query, /Nexo causal/);
  assert.equal(query.includes("objects are already normalized"), false);
});

test("Mitra analyze passes question and facts to consolidated search query without changing public payload", async () => {
  let capturedQuery = "";
  const orchestrator = createMitraProfessionalOrchestrator({
    consolidatedSearchImpl: async ({ query, tribunal, limit }) => {
      capturedQuery = query;
      assert.equal(tribunal, "STJ");
      assert.equal(limit, 3);
      return {
        sources_checked: ["lexml"],
        evidence: [
          {
            title: "Fonte oficial simulada",
            source: "LexML",
            url: "https://www.lexml.gov.br/",
            summary: "Evidência oficial simulada para teste."
          }
        ]
      };
    },
    analyzeStrategyImpl: async ({ question, facts, tribunal, searchResult }) => {
      assert.equal(question, "Quais teses revisar?");
      assert.deepEqual(facts, ["Responsabilidade civil médica em cirurgia eletiva."]);
      assert.equal(tribunal, "STJ");
      assert.equal(searchResult.evidence.length, 1);
      return {
        http: 200,
        payload: {
          status: "draft_review_required",
          answer: "Análise assistida depende de revisão humana."
        }
      };
    }
  });

  const response = await orchestrator.dispatch({
    path: "/v1/analyze",
    payload: {
      question: "Quais teses revisar?",
      facts: ["Responsabilidade civil médica em cirurgia eletiva."],
      tribunal: "STJ",
      limit: 3
    }
  });

  assert.equal(response.http, 200);
  assert.match(capturedQuery, /Quais teses revisar/);
  assert.match(capturedQuery, /Responsabilidade civil médica em cirurgia eletiva/);
  assert.equal(response.payload.ok, true);
  assert.equal(response.payload.retrieval.source_count, 1);
  assert.equal(response.payload.write_executed, false);
});
