import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { runSiteFactoryDryRun } from "../src/cli.mjs";
import { validateSiteManifest } from "../src/manifest.mjs";
import { createSiteFactoryDryRun } from "../src/planner.mjs";

const manifest = {
  schemaVersion: 1,
  site: {
    id: "apidevelopers-institution",
    domain: "apidevelopers.digital",
    engine: "wordpress",
    locale: "pt-BR",
    maintenance: true,
  },
  hostinger: {
    domain: "apidevelopers.digital",
  },
  wordpress: {
    baseUrl: "https://apidevelopers.digital",
    pages: [
      { slug: "inicio", title: "Início", status: "draft" },
      { slug: "instituicao", title: "Instituição", status: "draft" },
    ],
  },
};

function jsonResponse(payload, { status = 200, headers = {} } = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

test("manifest validation rejects publication in the foundation increment", () => {
  const unsafe = structuredClone(manifest);
  unsafe.wordpress.pages[0].status = "publish";

  assert.throws(
    () => validateSiteManifest(unsafe),
    /status must be draft/,
  );
});

test("planner is fail-closed and never marks the dry-run as apply-ready", () => {
  const plan = createSiteFactoryDryRun({
    manifest: validateSiteManifest(manifest),
    wordpressDiscovery: {
      hasWpV2: true,
      hasPagesRoute: true,
    },
    generatedAt: "2026-07-29T20:00:00.000Z",
  });

  assert.equal(plan.safety.writesEnabled, false);
  assert.equal(plan.readyForApply, false);
  assert.ok(plan.blockers.includes("hostinger_inventory_not_verified"));
  assert.ok(plan.blockers.includes("wordpress_authentication_not_validated"));
});

test("manifest-only CLI validates the declarative contract without network access", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "site-factory-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const manifestPath = join(directory, "site.json");
  const outputPath = join(directory, "report.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

  const report = await runSiteFactoryDryRun({
    argv: [
      "--manifest",
      manifestPath,
      "--manifest-only",
      "--output",
      outputPath,
    ],
    fetchImpl: async () => {
      throw new Error("network must not be used");
    },
    now: () => "2026-07-29T20:00:00.000Z",
  });

  assert.equal(report.valid, true);
  assert.equal(report.writesEnabled, false);
  assert.equal(report.desiredPages, 2);

  const persisted = JSON.parse(await readFile(outputPath, "utf8"));
  assert.equal(persisted.site.domain, "apidevelopers.digital");
});

test("public-only CLI discovers WordPress and produces blockers instead of writing", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "site-factory-public-"));
  t.after(() => rm(directory, { recursive: true, force: true }));

  const manifestPath = join(directory, "site.json");
  await writeFile(manifestPath, JSON.stringify(manifest), "utf8");

  const requests = [];
  const report = await runSiteFactoryDryRun({
    argv: ["--manifest", manifestPath, "--public-only"],
    env: {},
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({
        name: "API Developers.digital",
        url: "https://apidevelopers.digital",
        namespaces: ["wp/v2"],
        routes: {
          "/wp/v2": {},
          "/wp/v2/pages": {},
        },
      });
    },
    now: () => "2026-07-29T20:00:00.000Z",
  });

  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, "GET");
  assert.equal(report.wordpress.discovery.hasPagesRoute, true);
  assert.equal(report.safety.writesEnabled, false);
  assert.ok(report.blockers.includes("wordpress_authentication_not_validated"));
});
