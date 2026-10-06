import assert from "node:assert/strict";
import test from "node:test";

import {
  createKnowledgeIntakePlan,
  REAL_INGESTION_ENABLED,
} from "../src/index.mjs";

function baseMetadata(overrides = {}) {
  return {
    id: "book-fermentation-001",
    title: "Pilot Culinary Reference",
    author: "Example Author",
    source: "curated_local_material",
    publisher: "Example Publisher",
    year: 2024,
    url_or_reference: "local:pilot/fermentation-001",
    domain: "culinary",
    subdomain: "chef_sapiens",
    topic: "fermentation",
    material_type: "book",
    language: "pt-BR",
    license_status: "public_domain",
    usage_allowed: "fulltext_internal_allowed",
    access_level: "internal_fulltext_allowed",
    quality_level: "high",
    recency_level: "current",
    sensitive_data_risk: "low",
    copyright_risk: "low",
    summary: "Material piloto para validar o gate de ingestão culinária.",
    tags: ["culinary", "fermentation", "pilot"],
    curator: "human_curator",
    intake_date: "2026-10-05",
    reviewer: "pending_human_review",
    review_status: "quality_review_pending",
    storage_status: "intake_received",
    notes: "icebreaker pilot",
    ...overrides,
  };
}

const artifact = {
  filename: "pilot-book.pdf",
  mime_type: "application/pdf",
  sha256: "a".repeat(64),
  byte_size: 123456,
};

test("icebreaker culinary book produces review-required dry-run only", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata(),
    artifact,
    requested_use: "fulltext_internal_allowed",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.gate, "human_review_required");
  assert.equal(plan.real_ingestion_enabled, false);
  assert.equal(plan.content_write_authorized, false);
  assert.equal(plan.storage_plan.mode, "dry_run_only");
  assert.equal(plan.storage_plan.primary_role, "mac_storage_primary");
  assert.equal(plan.storage_plan.replica_role, "mac_storage_replica");
  assert.equal(plan.retrieval_plan.kernel, "@apidevelopers/kernel-retrieval");
});

test("unknown license blocks productive use", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata({
      license_status: "unknown",
      usage_allowed: "reference_only",
    }),
    artifact,
    requested_use: "fulltext_internal_allowed",
  });

  assert.equal(plan.ok, false);
  assert.equal(plan.gate, "blocked");
  assert.equal(plan.content_write_authorized, false);
  assert.ok(plan.reasons.includes("license_blocks_requested_use"));
});

test("subscription material stays reference-only", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata({
      license_status: "subscription_read_only",
      usage_allowed: "reference_only",
    }),
    artifact,
    requested_use: "reference_only",
  });

  assert.equal(plan.ok, true);
  assert.equal(plan.effective_use, "reference_only");
  assert.equal(plan.content_write_authorized, false);
});

test("missing mandatory metadata fails closed", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata({ title: "", curator: "" }),
    artifact,
  });

  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.some((reason) => reason.startsWith("metadata_missing:")));
});

test("planner rejects raw content payloads", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata(),
    artifact: { ...artifact, bytes: Buffer.from("do-not-accept") },
  });

  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes("raw_content_not_accepted_by_intake_planner"));
});

test("high sensitive-data risk blocks intake plan", () => {
  const plan = createKnowledgeIntakePlan({
    metadata: baseMetadata({ sensitive_data_risk: "high" }),
    artifact,
  });

  assert.equal(plan.ok, false);
  assert.ok(plan.reasons.includes("sensitive_data_review_block"));
});

test("real ingestion is globally disabled in v1", () => {
  assert.equal(REAL_INGESTION_ENABLED, false);
});
