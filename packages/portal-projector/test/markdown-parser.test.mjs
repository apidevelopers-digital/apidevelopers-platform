
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parsePortalMarkdown, parseSimpleYaml, validateInternalMarkdownLinks } from "../src/markdown-parser.mjs";

const COMMIT = "878cd3ba4b37afd08255d410aee6cf44f22ec9b6";
const fixturePath = new URL("./fixtures/PORTAL_DATA_MODEL.fixture.md", import.meta.url);

test("parses real Portal fixture deterministically", async () => {
  const content = await readFile(fixturePath, "utf8");
  const one = parsePortalMarkdown({ path: "docs/architecture/PORTAL_DATA_MODEL.md", commit: COMMIT, content });
  const two = parsePortalMarkdown({ path: "docs/architecture/PORTAL_DATA_MODEL.md", commit: COMMIT, content });
  assert.deepEqual(one, two);
  assert.equal(one.title, "PORTAL DATA MODEL");
  assert.equal(one.yamlBlocks.length, 2);
  assert.equal(one.yamlBlocks[0].value.repository, "sitedauni/apidevelopers-platform");
});

test("extracts stable headings and relative links", async () => {
  const content = await readFile(fixturePath, "utf8");
  const doc = parsePortalMarkdown({ path: "docs/architecture/PORTAL_DATA_MODEL.md", commit: COMMIT, content });
  assert.deepEqual(doc.headings.map(({ level, anchor }) => [level, anchor]), [
    [1, "portal-data-model"],
    [2, "7-objetos-fundamentais"],
    [3, "7-1-sourceref"],
    [2, "11-modulos-da-arquitetura-do-portal"],
  ]);
  assert.equal(doc.links[0].target, "portal/README.md");
});

test("rejects missing or multiple level-1 titles", () => {
  assert.throws(() => parsePortalMarkdown({ path: "x.md", commit: COMMIT, content: "## child" }), /level-1 title/);
  assert.throws(() => parsePortalMarkdown({ path: "x.md", commit: COMMIT, content: "# A\n# B" }), /exactly one/);
});

test("rejects unclosed fences", () => {
  assert.throws(() => parsePortalMarkdown({ path: "x.md", commit: COMMIT, content: "# A\n```yaml\na: b" }), /unclosed code fence/);
});

test("simple yaml parser rejects duplicate keys and tabs", () => {
  assert.throws(() => parseSimpleYaml("a: 1\na: 2"), /duplicate key/);
  assert.throws(() => parseSimpleYaml("a:\n\tb: 1"), /tabs are not allowed/);
});

test("validates internal markdown links against available paths", async () => {
  const content = await readFile(fixturePath, "utf8");
  const doc = parsePortalMarkdown({ path: "docs/architecture/PORTAL_DATA_MODEL.md", commit: COMMIT, content });
  const available = [
    "docs/architecture/portal/README.md",
    "docs/architecture/portal/PROJECTIONS.md",
  ];
  const findings = validateInternalMarkdownLinks(doc, available);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].target, "docs/architecture/portal/PROJECTOR_CONTRACT.md");
});

test("ignores external and anchor-only links", () => {
  const doc = parsePortalMarkdown({
    path: "docs/a.md",
    commit: COMMIT,
    content: "# A\n[web](https://example.com)\n[anchor](#x)",
  });
  assert.deepEqual(validateInternalMarkdownLinks(doc, []), []);
});
