import assert from "node:assert/strict";
import test from "node:test";
import {
  LEX_SOURCE_SHA,
  mitraProfessionalOrchestrator,
} from "@apidevelopers/lex-legal-runtime";

const EXPECTED_SOURCE_SHA = "a32f20f8fe7d4197eab8168a990846e2b89a8048";

test("embedded Lex runtime is pinned to the approved canonical SHA", () => {
  assert.equal(LEX_SOURCE_SHA, EXPECTED_SOURCE_SHA);
});

test("embedded Assistant fails closed before retrieval on an empty question", async () => {
  const result = await mitraProfessionalOrchestrator.dispatch({
    path: "/v1/analyze",
    payload: { question: "" },
  });
  assert.equal(result.http, 400);
  assert.equal(result.payload.ok, false);
  assert.equal(result.payload.read_only, true);
  assert.equal(result.payload.persistence, false);
  assert.equal(result.payload.database_write_allowed, false);
  assert.equal(result.payload.write_executed, false);
  assert.equal(result.payload.human_review_required, true);
  assert.equal(result.payload.final_legal_conclusion_allowed, false);
});

test("embedded Jurimetrics fails closed when DataJud is disabled", async () => {
  const previous = process.env.DATAJUD_ENABLED;
  process.env.DATAJUD_ENABLED = "false";
  try {
    const result = await mitraProfessionalOrchestrator.dispatch({
      path: "/v1/jurimetrics/search",
      payload: { tribunal: "tjsp", classe_codigo: 7 },
    });
    assert.equal(result.http, 503);
    assert.equal(result.payload.ok, false);
    assert.equal(result.payload.read_only, true);
    assert.equal(result.payload.persistence, false);
    assert.equal(result.payload.database_write_allowed, false);
    assert.equal(result.payload.write_executed, false);
    assert.equal(result.payload.human_review_required, true);
    assert.equal(result.payload.final_legal_conclusion_allowed, false);
  } finally {
    if (previous === undefined) delete process.env.DATAJUD_ENABLED;
    else process.env.DATAJUD_ENABLED = previous;
  }
});

test("embedded Veritas preserves read-only governance", async () => {
  const result = await mitraProfessionalOrchestrator.dispatch({
    path: "/v1/veritas",
    payload: {
      mode: "claim_precheck",
      claim: "Afirmação sujeita a conferência humana.",
      evidence: {},
    },
  });
  assert.equal(result.http, 200);
  assert.equal(result.payload.ok, true);
  assert.equal(result.payload.read_only, true);
  assert.equal(result.payload.persistence, false);
  assert.equal(result.payload.office_database_access, false);
  assert.equal(result.payload.database_write_allowed, false);
  assert.equal(result.payload.write_executed, false);
  assert.equal(result.payload.human_review_required, true);
  assert.equal(result.payload.final_legal_conclusion_allowed, false);
  assert.equal(result.payload.probability_of_success_allowed, false);
  assert.equal(result.payload.no_invention_policy, true);
});
