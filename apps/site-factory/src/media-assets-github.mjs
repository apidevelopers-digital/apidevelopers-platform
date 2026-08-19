import {
  buildManifest,
  buildMediaPaths,
  normalizeMediaSpec,
  sha256Hex,
} from "./media-assets-core.mjs";

const API_VERSION = "2022-11-28";
const api = (base, s, path) =>
  `${base.replace(/\/$/, "")}/repos/${encodeURIComponent(s.owner)}/${encodeURIComponent(s.repo)}${path}`;
const encRef = (v) => v.split("/").map(encodeURIComponent).join("/");
const req = (name, v) => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`missing_or_invalid:${name}`);
  return v.trim();
};
const auth = (token) => ({
  accept: "application/vnd.github+json",
  authorization: `Bearer ${req("token", token)}`,
  "content-type": "application/json",
  "x-github-api-version": API_VERSION,
});

async function call(fetchImpl, url, token, method = "GET", body, accepted = [200]) {
  const res = await fetchImpl(url, {
    method,
    headers: auth(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let payload = null;
  if (text) {
    try { payload = JSON.parse(text); }
    catch { throw new Error(`github_api_invalid_json:${res.status}`); }
  }
  if (!accepted.includes(res.status)) throw new Error(`github_api_failed:${method}:${res.status}`);
  return { status: res.status, payload };
}
function decodeBlob(payload) {
  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {
    throw new Error("github_blob_missing_base64_content");
  }
  return Buffer.from(payload.content.replace(/\s+/g, ""), "base64");
}

async function catalog({ token, spec, fetchImpl, apiBaseUrl }) {
  const root = api(apiBaseUrl, spec, "");
  const ref = await call(fetchImpl, `${root}/git/ref/heads/${encRef(spec.baseBranch)}`, token);
  const commitSha = req("baseCommitSha", ref.payload?.object?.sha);
  const commit = await call(fetchImpl, `${root}/git/commits/${encodeURIComponent(commitSha)}`, token);
  const treeSha = req("baseTreeSha", commit.payload?.tree?.sha);
  const treeRes = await call(fetchImpl, `${root}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`, token);
  if (treeRes.payload?.truncated || !Array.isArray(treeRes.payload?.tree)) throw new Error("github_tree_unusable");
  return { root, commitSha, treeSha, tree: treeRes.payload.tree };
}
async function manifest(fetchImpl, token, cat, entry) {
  const blob = await call(fetchImpl, `${cat.root}/git/blobs/${encodeURIComponent(req("blobSha", entry.sha))}`, token);
  try { return JSON.parse(decodeBlob(blob.payload).toString("utf8")); }
  catch { throw new Error(`invalid_manifest_json:${entry.path}`); }
}
async function inspect({ token, spec, digest, paths, fetchImpl, apiBaseUrl }) {
  const cat = await catalog({ token, spec, fetchImpl, apiBaseUrl });
  let existing = null;
  let targetManifest = null;
  for (const entry of cat.tree.filter((e) => e?.type === "blob" && e?.path?.startsWith("library/") && e.path.endsWith("/manifest.json"))) {
    const data = await manifest(fetchImpl, token, cat, entry);
    if (entry.path === paths.manifest) targetManifest = data;
    if (!Array.isArray(data?.assets)) continue;
    const root = entry.path.slice(0, -"/manifest.json".length);
    const hit = data.assets.find((a) => typeof a?.sha256 === "string" && a.sha256.toLowerCase() === digest && typeof a?.path === "string");
    if (hit) { existing = { path: `${root}/${hit.path}`, manifest: entry.path, sha256: digest }; break; }
  }
  const occupied = cat.tree.some((e) => e?.type === "blob" && e.path === paths.asset);
  return { cat, existing, targetManifest, occupied };
}

export async function prepareMediaIntake({
  token, mediaBuffer, spec: inputSpec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com",
}) {
  const spec = normalizeMediaSpec(inputSpec);
  const digest = sha256Hex(mediaBuffer);
  const paths = buildMediaPaths(spec, digest);
  const state = await inspect({ token, spec, digest, paths, fetchImpl, apiBaseUrl });
  if (state.existing) return Object.freeze({
    result: "reuse-existing", sha256: digest, bytes: mediaBuffer.length,
    existing: state.existing, repository: spec.repository, baseBranch: spec.baseBranch,
  });
  if (state.occupied) throw new Error(`canonical_path_occupied:${paths.asset}`);
  return Object.freeze({
    result: "new-candidate", sha256: digest, bytes: mediaBuffer.length, paths,
    repository: spec.repository, baseBranch: spec.baseBranch,
    _internal: { spec, cat: state.cat, targetManifest: state.targetManifest },
  });
}

async function branchRef(fetchImpl, token, cat, branch) {
  return call(fetchImpl, `${cat.root}/git/ref/heads/${encRef(branch)}`, token, "GET", undefined, [200, 404]);
}
async function draftPr(fetchImpl, token, cat, spec, branch, digest) {
  const q = new URLSearchParams({ state: "open", head: `${spec.owner}:${branch}`, base: spec.baseBranch, per_page: "10" });
  const found = await call(fetchImpl, `${cat.root}/pulls?${q}`, token);
  if (!Array.isArray(found.payload)) throw new Error("github_pulls_invalid");
  if (found.payload[0]) return found.payload[0];
  const body = {
    title: `media(${spec.collection}): registrar ${spec.slug}`,
    head: branch, base: spec.baseBranch, draft: true,
    body: `## Intake canônico\n\n- SHA-256: \`${digest}\`\n- superfície: \`${spec.surface}\`\n- coleção: \`${spec.collection}\`\n- papel: \`${spec.role}\`\n\nNenhum merge ou publicação é executado por este intake.`,
  };
  return (await call(fetchImpl, `${cat.root}/pulls`, token, "POST", body, [201])).payload;
}

export async function applyMediaIntake({
  token, mediaBuffer, spec: inputSpec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com",
}) {
  const prepared = await prepareMediaIntake({ token, mediaBuffer, spec: inputSpec, fetchImpl, apiBaseUrl });
  if (prepared.result === "reuse-existing") return Object.freeze({ applied: false, ...prepared });

  const { spec, cat, targetManifest } = prepared._internal;
  const { paths } = prepared;
  const current = await branchRef(fetchImpl, token, cat, paths.branch);
  if (current.status === 200) {
    const pr = await draftPr(fetchImpl, token, cat, spec, paths.branch, prepared.sha256);
    return Object.freeze({
      applied: false, result: "reuse-pending-branch", repository: spec.repository,
      branch: paths.branch, commitSha: req("branchSha", current.payload?.object?.sha),
      pullRequest: { number: pr.number, url: pr.html_url, draft: pr.draft },
      sha256: prepared.sha256, bytes: prepared.bytes,
    });
  }

  const data = buildManifest({ existing: targetManifest, spec, digest: prepared.sha256, bytes: prepared.bytes });
  const assetBlob = await call(fetchImpl, `${cat.root}/git/blobs`, token, "POST",
    { content: mediaBuffer.toString("base64"), encoding: "base64" }, [201]);
  const manifestBlob = await call(fetchImpl, `${cat.root}/git/blobs`, token, "POST",
    { content: `${JSON.stringify(data, null, 2)}\n`, encoding: "utf-8" }, [201]);
  const tree = await call(fetchImpl, `${cat.root}/git/trees`, token, "POST", {
    base_tree: cat.treeSha,
    tree: [
      { path: paths.asset, mode: "100644", type: "blob", sha: req("assetBlobSha", assetBlob.payload?.sha) },
      { path: paths.manifest, mode: "100644", type: "blob", sha: req("manifestBlobSha", manifestBlob.payload?.sha) },
    ],
  }, [201]);
  const commit = await call(fetchImpl, `${cat.root}/git/commits`, token, "POST", {
    message: `media(${spec.collection}): registrar ${spec.slug}`,
    tree: req("newTreeSha", tree.payload?.sha), parents: [cat.commitSha],
  }, [201]);
  const commitSha = req("commitSha", commit.payload?.sha);
  await call(fetchImpl, `${cat.root}/git/refs`, token, "POST",
    { ref: `refs/heads/${paths.branch}`, sha: commitSha }, [201]);
  const pr = await draftPr(fetchImpl, token, cat, spec, paths.branch, prepared.sha256);
  return Object.freeze({
    applied: true, result: "draft-pr-created", repository: spec.repository,
    branch: paths.branch, commitSha,
    pullRequest: { number: pr.number, url: pr.html_url, draft: pr.draft },
    sha256: prepared.sha256, bytes: prepared.bytes, paths,
  });
}
