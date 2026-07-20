import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import {
  createPortalDocumentPipeline,
  projectPortalDocuments,
} from "../src/document-pipeline.mjs";

const COMMIT = "0cc8b3c7b308959ce8090278cbf9113ab5b7d10d";

function checksum(content) {
  return createHash("sha256").update(content, "utf8").digest("hex");
}

function fixture(overrides = {}) {
  const contents = new Map([
    ["docs/architecture/PORTAL_DATA_MODEL.md", "# Portal Data Model\n"],
    ["docs/architecture/portal/README.md", "# Portal\n"],
  ]);
  return {
    repository: "sitedauni/apidevelopers-platform",
    commit: COMMIT,
    mutationAllowed: false,
    list: async (prefix) => [...contents.keys()].filter((path) => path === prefix || path.startsWith(`${prefix}/`)),
    readMany: async (paths) => paths.map((path) => ({
      path,
      commit: COMMIT,
      content: contents.get(path),
      checksum: checksum(contents.get(path)),
    })),
    ...overrides,
  };
}

function parse({ path, commit, content }) {
  return Object.freeze({
    path,
    commit,
    title: content.slice(2).trim(),
    headings: Object.freeze([]),
    links: Object.freeze([]),
    yamlBlocks: Object.freeze([]),
  });
}

test("projects all Portal Markdown documents from one fixed commit", async () => {
  const projection = await projectPortalDocuments({ reader: fixture(), parse, validateLinks: () => [] });
  assert.equal(projection.sourceCommit, COMMIT);
  assert.equal(projection.documentCount, 2);
  assert.deepEqual(projection.records.map((record) => record.path), [
    "docs/architecture/PORTAL_DATA_MODEL.md",
    "docs/architecture/portal/README.md",
  ]);
  assert.match(projection.contentChecksum, /^[0-9a-f]{64}$/);
});

test("is deterministic across repeated executions", async () => {
  const reader = fixture();
  const one = await projectPortalDocuments({ reader, parse, validateLinks: () => [] });
  const two = await projectPortalDocuments({ reader, parse, validateLinks: () => [] });
  assert.deepEqual(one, two);
});

test("rejects readers that are not explicitly read-only", async () => {
  await assert.rejects(
    projectPortalDocuments({ reader: fixture({ mutationAllowed: true }), parse, validateLinks: () => [] }),
    (error) => error.code === "PORTAL_DOCUMENT_PIPELINE_MUTATION_FORBIDDEN",
  );
});

test("rejects mixed-commit reads", async () => {
  const reader = fixture({
    readMany: async (paths) => paths.map((path) => ({
      path,
      commit: "a".repeat(40),
      content: "# Wrong\n",
      checksum: checksum("# Wrong\n"),
    })),
  });
  await assert.rejects(
    projectPortalDocuments({reader, parse, validateLinks: () => [] }),
    (error) => error.code === "PORTAL_DOCUMENT_PIPELINE_READ_INVALID",
  );
});

test("fails closed when internal links are invalid", async () => {
  await assert.rejects(
    projectPortalDocuments({reader: fixture(), parse, validateLinks: (document) => document.path.endsWith("README.md") ? [{ code: "PORTAL_MARKDOWN_LINK_MISSING", sourcePath: document.path, target: "missing.md", line: 2 }] : [] }),
    (error) => error.code === "PORTAL_DOCUMENT_PIPELINE_LINKS_INVALID" && error.details.findings.length === 1,
  );
});

test("rejects empty document sets", async () => {
  await assert.rejects(
    projectPortalDocuments({reader: fixture({ list: async () => [] }), parse, validateLinks: () => [] }),
    (error) => error.code === "PORTAL_DOCUMENT_PIPELINE_EMPTY",
  );
});

test("pipeline facade remains read-only", () => {
  const pipeline = createPortalDocumentPipeline({ parse, validateLinks: () => [] });
  assert.equal(pipeline.mutationAllowed, false);
  assert.equal(typeof pipeline.project, "function");
  assert.equal("write" in pipeline, false);
});
