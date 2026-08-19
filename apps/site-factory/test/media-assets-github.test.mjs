import test from "node:test";
import assert from "node:assert/strict";
import { buildManifest, buildMediaPaths, normalizeMediaSpec, sha256Hex } from "../src/media-assets-core.mjs";
import { applyMediaIntake, prepareMediaIntake } from "../src/media-assets-github.mjs";

const spec = {
  sourceName: "premium.webp",
  surface: "public-site",
  collection: "factory",
  date: "2026-08-19",
  role: "reference",
  slug: "premium-reference",
  sourceType: "openai-generated",
  provenance: "Imagem gerada pela ADA.",
  width: 1200,
  height: 700,
  usagePr: 55,
};
const response = (payload, status = 200) =>
  new Response(payload == null ? "" : JSON.stringify(payload), { status });

test("core produz identidade e caminho determinísticos", () => {
  const media = Buffer.from("premium");
  const digest = sha256Hex(media);
  const normalized = normalizeMediaSpec(spec);
  const paths = buildMediaPaths(normalized, digest);
  assert.equal(digest, "870dc23d21836b97b58a7753922edc8512764e83c02586f3d8f14c11f760550b");
  assert.equal(paths.asset, "library/public-site/factory/2026-08-19/reference/premium-reference.webp");
  assert.equal(paths.branch, `media/2026-08-19/premium-reference-${digest.slice(0, 12)}`);
});

test("manifesto novo registra dimensões e uso", () => {
  const normalized = normalizeMediaSpec(spec);
  const data = buildManifest({ existing: null, spec: normalized, digest: "1".repeat(64), bytes: 42 });
  assert.equal(data.assets[0].width, 1200);
  assert.equal(data.assets[0].height, 700);
  assert.equal(data.usage[0].pr, 55);
});

test("dry-run reutiliza asset já catalogado por SHA-256", async () => {
  const media = Buffer.from("same-media");
  const digest = sha256Hex(media);
  const manifest = {
    schema: "apidevelopers.media-assets/v1",
    collection: "public-site/factory",
    date: "2026-08-18",
    status: "candidate",
    source: { type: "generated", provenance: "teste" },
    assets: [{ path: "derived/already.webp", bytes: media.length, sha256: digest }],
    usage: [],
  };
  const fetchImpl = async (url) => {
    const u = String(url);
    if (u.includes("/git/ref/heads/main")) return response({ object: { sha: "base" } });
    if (u.includes("/git/commits/base")) return response({ tree: { sha: "tree" } });
    if (u.includes("/git/trees/tree?recursive=1")) return response({
      truncated: false,
      tree: [{ type: "blob", path: "library/public-site/factory/2026-08-18/manifest.json", sha: "m1" }],
    });
    if (u.includes("/git/blobs/m1")) return response({
      encoding: "base64",
      content: Buffer.from(JSON.stringify(manifest)).toString("base64"),
    });
    throw new Error(`unexpected:${u}`);
  };
  const out = await prepareMediaIntake({
    token: "test", mediaBuffer: media, spec, fetchImpl, apiBaseUrl: "https://api.test",
  });
  assert.equal(out.result, "reuse-existing");
  assert.equal(out.existing.path, "library/public-site/factory/2026-08-18/derived/already.webp");
});

test("apply é idempotente quando branch determinística já existe", async () => {
  const media = Buffer.from("pending");
  const digest = sha256Hex(media);
  const branch = `media/2026-08-19/premium-reference-${digest.slice(0, 12)}`;
  const methods = [];
  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    methods.push(options.method || "GET");
    if (u.includes("/git/ref/heads/main")) return response({ object: { sha: "base" } });
    if (u.includes("/git/commits/base")) return response({ tree: { sha: "tree" } });
    if (u.includes("/git/trees/tree?recursive=1")) return response({ truncated: false, tree: [] });
    if (u.includes(`/git/ref/heads/${branch}`)) return response({ object: { sha: "pending-sha" } });
    if (u.includes("/pulls?")) return response([{ number: 9, html_url: "https://github.test/pr/9", draft: true }]);
    throw new Error(`unexpected:${u}`);
  };
  const out = await applyMediaIntake({
    token: "test", mediaBuffer: media, spec, fetchImpl, apiBaseUrl: "https://api.test",
  });
  assert.equal(out.result, "reuse-pending-branch");
  assert.equal(out.pullRequest.number, 9);
  assert.equal(methods.includes("POST"), false);
});
