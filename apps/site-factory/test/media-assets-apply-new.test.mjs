import test from "node:test";
import assert from "node:assert/strict";
import { applyMediaIntake } from "../src/media-assets-github.mjs";
import { sha256Hex } from "../src/media-assets-core.mjs";

const response = (payload, status = 200) =>
  new Response(payload == null ? "" : JSON.stringify(payload), { status });

const spec = {
  sourceName: "new-premium.webp",
  surface: "public-site",
  collection: "factory",
  date: "2026-08-19",
  role: "reference",
  slug: "new-premium",
  sourceType: "openai-generated",
  provenance: "Imagem gerada pela ADA para fábrica.",
  width: 1200,
  height: 700,
  usageSurface: "preview",
  usageRepository: "apidevelopers-digital/apidevelopers-digital",
};

test("apply cria somente branch de mídia e Draft PR para candidato novo", async () => {
  const media = Buffer.from("new-canonical-media");
  const digest = sha256Hex(media);
  const branch = `media/2026-08-19/new-premium-${digest.slice(0, 12)}`;
  const calls = [];

  const fetchImpl = async (url, options = {}) => {
    const u = String(url);
    const method = options.method || "GET";
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ u, method, body });

    if (method === "GET" && u.includes("/git/ref/heads/main")) return response({ object: { sha: "base-head" } });
    if (method === "GET" && u.includes("/git/commits/base-head")) return response({ tree: { sha: "base-tree" } });
    if (method === "GET" && u.includes("/git/trees/base-tree?recursive=1")) return response({ truncated: false, tree: [] });
    if (method === "GET" && u.includes(`/git/ref/heads/${branch}`)) return response({ message: "Not Found" }, 404);
    if (method === "POST" && u.endsWith("/git/blobs")) {
      if (body.encoding === "base64") return response({ sha: "asset-blob" }, 201);
      if (body.encoding === "utf-8") return response({ sha: "manifest-blob" }, 201);
    }
    if (method === "POST" && u.endsWith("/git/trees")) return response({ sha: "new-tree" }, 201);
    if (method === "POST" && u.endsWith("/git/commits")) return response({ sha: "new-commit" }, 201);
    if (method === "POST" && u.endsWith("/git/refs")) return response({ ref: `refs/heads/${branch}`, object: { sha: "new-commit" } }, 201);
    if (method === "GET" && u.includes("/pulls?")) return response([]);
    if (method === "POST" && u.endsWith("/pulls")) return response({ number: 12, html_url: "https://github.test/pr/12", draft: true }, 201);
    throw new Error(`unexpected:${method}:${u}`);
  };

  const out = await applyMediaIntake({
    token: "test", mediaBuffer: media, spec, fetchImpl, apiBaseUrl: "https://api.test",
  });

  assert.equal(out.applied, true);
  assert.equal(out.result, "draft-pr-created");
  assert.equal(out.branch, branch);
  assert.equal(out.pullRequest.number, 12);
  assert.equal(out.pullRequest.draft, true);

  const refCreate = calls.find((c) => c.method === "POST" && c.body?.ref);
  assert.equal(refCreate.body.ref, `refs/heads/${branch}`);
  assert.equal(calls.some((c) => c.method === "PATCH"), false);

  const treeCreate = calls.find((c) => c.method === "POST" && c.u.endsWith("/git/trees"));
  assert.equal(treeCreate.body.base_tree, "base-tree");
  assert.deepEqual(
    treeCreate.body.tree.map((v) => v.path).sort(),
    [
      "library/public-site/factory/2026-08-19/manifest.json",
      "library/public-site/factory/2026-08-19/reference/new-premium.webp",
    ].sort(),
  );

  const prCreate = calls.find((c) => c.method === "POST" && c.u.endsWith("/pulls"));
  assert.equal(prCreate.body.draft, true);
});
