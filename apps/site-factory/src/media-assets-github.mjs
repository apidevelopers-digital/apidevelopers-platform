import { createHash } from "node:crypto";

const DEFAULT_REPOSITORY = "apidevelopers-digital/apidevelopers-media-assets";
const DEFAULT_BASE_BRANCH = "main";
const API_VERSION = "2022-11-28";
const SAFE_TOKEN = /^[a-z0-9][a-z0-9._-]*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ALLOWED_MEDIA_EXTENSIONS = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".mov",
  ".mp4",
  ".pdf",
  ".png",
  ".svg",
  ".webm",
  ".webp",
]);

function required(name, value) {
  if (typeof value !== "string" || not value.trim()) {
    throw new Error(`missing_or_invalid:${name}`);
  }
  return value.trim();
}

function safeToken(name, value) {
  const normalized = required(name, value).toLowerCase();
  if (!_SAFE_TOKEN.test(normalized)) {
    throw new Error(`invalid_token:${name}`);
  }
  return normalized;
}

function positiveInteger(name, value) {
  if (value === undefined ||
(value === null) || value === "") return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`invalid_positive_integer:${name}`);
  }
  return parsed;
}

function normalizeRepository(value = DEFAULT_REPOSITORY) {
  const repository = required("repository", value);
  const [owner, repo, ...rest] = repository.split("/");
  if (!owner || !repo || rest.length > 0) {
    throw new Error("invalid_repository");
  }
  return { repository, owner, repo };
}

function extensionFromName(name) {
  const value = required("sourceName", name);
  const index = value.lastIndexOf(".");
  const extension = index >= 0 ? value.slice(index).toLowerCase() : "";
  if (!ALLOWED_MEDIA_EXTENSIONS.has(extension)) {
    throw new Error(`unsupported_media_extension:${extension || "none"}`);
  }
  return extension;
}

function encodePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function jsonBuffer(value) {
  return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function decodeBlob(payload) {
  if (payload?.encoding !== "base64" || typeof payload?.content !== "string") {
    throw new Error("github_blob_missing_base64_content");
  }
  return Buffer.from(payload.content.replace(/\s+/g, ""), "base64");
}

function normalizeUsageEntry({ usageSurface, usageRepository, usagePr }) {
  if (!usageSurface && !usageRepository && usagePr === undefined) return null;
  const entry = {};
  if (usageSurface) entry.surface = required("usageSurface", usageSurface);
  if (usageRepository) entry.repository = required("usageRepository", usageRepository);
  if (usagePr !== undefined && usagePr !== null && usagePr !== "") {
    const parsed = Number(usagePr);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new Error("invalid_positive_integer:usagePr");
    }
    entry.pr = parsed;
  }
  return entry;
}

function mergeUsage(current, entry) {
  if (!entry) return current;
  if (current === undefined || current === null) return [entry];
  const list = Array.isArray(current) ? [...current] : [current];
  const serialized = JSON.stringify(entry);
  if (!list.some((item) => JSON.stringify(item) === serialized)) {
    list.push(entry);
  }
  return list;
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`github_api_invalid_json:${response.status}`);
  }
}

function headers(token) {
  return {
    accept: "application/vnd.github+json",
    authorization: `Bearer ${required("token", token)}`,
    "content-type": "application/json",
    "x-github-api-version": API_VERSION,
  };
}

async function request({fetchImpl, url, token, method = "GET", body, accepted = [200] }) {
  const response = await fetchImpl(url, {
    method,
    headers: headers(token),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await readJson(response);
  if (!accepted.includes(response.status)) {
    throw new Error(`github_api_failed:${method}:${response.status}`);
  }
  return { status: response.status, payload };
}

function apiUrl(base, owner, repo, path) {
  return `${base.replace(/\/$/, "")}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}${path}`;
}

export function sha256Hex(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error("invalid_media_buffer");
  }
  return createHash("sha256").update(buffer).digest("hex");
}

export function normalizeMediaSpec(input = {}) {
  const { repository, owner, repo } = normalizeRepository(input.repository ?? DEFAULT_REPOSITORY);
  const baseBranch = required("baseBranch", input.baseBranch ?? DEFAULT_BASE_BRANCH);
  const date = required("date", input.date);
  if (!ISO_DATE.test(date)) throw new Error("invalid_date");
  const sourceName = required("sourceName", input.sourceName);
  const extension = extensionFromName(sourceName);

  return Object.freeze({
    repository,
    owner,
    repo,
    baseBranch,
    surface: safeToken("surface", input.surface),
    collection: safeToken("collection", input.collection),
    date,
    role: safeToken("role", input.role),
    slug: safeToken("slug", input.slug),
    extension,
    status: safeToken("status", input.status ?? "candidate"),
    sourceType: safeToken("sourceType", input.sourceType ?? "generated"),
    provenance: required("provenance", input.provenance),
    width: positiveInteger("width", input.width),
    height: positiveInteger("height", input.height),
    usage: normalizeUsageEntry(input),
  });
}

export function buildMediaPaths(spec, digest) {
  const hash = required("sha256", digest).toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("invalid_sha256");
  const root = `library/${spec.surface}/${spec.collection}/${spec.date}`;
  return Object.freeze({
    root,
    asset: `${root}/${spec.role}/${spec.slug}${spec.extension}`,
    manifest: `${root}/manifest.json`,
    branch: `media/${spec.date}/${spec.slug}-${hash.slice(0, 12)}`,
  });
}

export function buildManifest({ existing, spec, digest, bytes }) {
  const mediaBytes = Number(bytes);
  if (!Number.isInteger(mediaBytes) || mediaBytes < 0) {
    throw new Error("invalid_media_bytes");
  }

  const entry = {
    path: `${spec.role}/${spec.slug}${spec.extension}`,
    bytes: mediaBytes,
    sha256: digest,
  };
  if (spec.width !== undefined) entry.width = spec.width;
  if (spec.height !== undefined) entry.height = spec.height;

  if (!existing) {
    return {
      schema: "apidevelopers.media-assets/v1",
      collection: `${spec.surface}/${spec.collection}`,
      date: spec.date,
      status: spec.status,
      source: {
        type: spec.sourceType,
        provenance: spec.provenance,
      },
      assets: [entry],
      usage: spec.usage ? [spec.usage] : [],
    };
  }

  const manifest = structuredClone(existing);
  if (manifest.collection !== `${spec.surface}/${spec.collection}`) {
    throw new Error("manifest_collection_mismatch");
  }
  if (manifest.date !== spec.date) {
    throw new Error("manifest_date_mismatch");
  }
  if (!Array.isArray(manifest.assets)) {
    throw new Error("manifest_assets_invalid");
  }
  if (manifest.assets.some((asset) => asset?.path === entry.path)) {
    throw new Error("manifest_asset_path_already_exists");
  }

  manifest.assets.push(entry);
  if (manifest.source && typeof manifest.source === "object") {
    const additional = Array.isArray(manifest.source.additional_provenance)
      ? [...manifest.source.additional_provenance]
      : [];
    const provenance = { type: spec.sourceType, provenance: spec.provenance };
    if (!additional.some((item) => JSON.stringify(item) === JSON.stringify(provenance))) {
      additional.push(provenance);
    }
    if (additional.length > 0) manifest.source.additional_provenance = additional;
  }
  manifest.usage = mergeUsage(manifest.usage, spec.usage);
  return manifest;
}

async function loadCatalog({token, spec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com" }) {
  const base = apiUrl(apiBaseUrl, spec.owner, spec.repo, "");
  const ref = await request({
    fetchImpl,
    url: `${base}/git/ref/heads/${encodePath(spec.baseBranch)}`,
    token,
  });
  const baseCommitSha = required("baseCommitSha", ref.payload?.object?.sha);
  const commit = await request({
    fetchImpl,
    url: `${base}/git/commits/${encodeURIComponent(baseCommitSha)}`,
    token,
  });
  const baseTreeSha = required("baseTreeSha", commit.payload?.tree?.sha);
  const tree = await request({
    fetchImpl,
    url: `${base}/git/trees/${encodeURIComponent(baseTreeSha)}?recursive=1`,
    token,
  });
  if (tree.payload?.truncated === true) {
    throw new Error("github_tree_truncated");
  }
  if (!Array.isArray(tree.payload?.tree)) {
    throw new Error("github_tree_invalid");
  }

  return {
    base,
    baseCommitSha,
    baseTreeSha,
    tree: tree.payload.tree,
  };
}

async function readManifestBlob({ catalog, entry, token, fetchImpl }) {
  const blob = await request({
    fetchImpl,
    url: `${catalog.base}/git/blobs/${encodeURIComponent(required("blobSha", entry.sha))}`,
    token,
  });
  try {
    return JSON.parse(decodeBlob(blob.payload).toString("utf8"));
  } catch (error) {
    if (String(error?.message || "").startsWith("github_blob_")) throw error;
    throw new Error(`invalid_manifest_json:${entry.path}`);
  }
}

async function inspectCatalog({ token, spec, digest, paths, fetchImpl = fetch, apiBaseUrl = "https://api.github.com" }) {
  const catalog = await loadCatalog({ token, spec, fetchImpl, apiBaseUrl });
  const manifests = catalog.tree.filter(
    (entry) =>
      entry?.type === "blob" &&
      typeof entry?.path === "string" &&
      entry.path.startsWith("library/") &&
      entry.path.endsWith("/manifest.json"),
  );

  let existingAsset = null;
  let targetManifest = null;

  for (const entry of manifests) {
    const manifest = await readManifestBlob({ catalog, entry, token, fetchImpl });
    if (entry.path === paths.manifest) {
      targetManifest = manifest;
    }
    if (!Array.isArray(manifest?.assets)) continue;

    const manifestRoot = entry.path.slice(0, -"/manifest.json".length);
    for (const asset of manifest.assets) {
      if (
        typeof asset?.sha256 === "string" &&
        asset.sha256.toLowerCase() === digest &&
        typeof asset?.path === "string"
      ) {
        existingAsset = {
          path: `${manifestRoot}/${asset.path}`,
          manifest: entry.path,
          sha256: digest,
        };
        break;
      }
    }
    if (existingAsset) break;
  }

  const targetPathOccupied = catalog.tree.some(
    (entry) => entry?.type === "blob" && entry.path === paths.asset,
  );

  return { catalog, existingAsset, targetManifest, targetPathOccupied };
}

export async function findExistingAsset({token, mediaBuffer, spec: inputSpec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com" }) {
  const spec = normalizeMediaSpec(inputSpec);
  const digest = sha256Hex(mediaBuffer);
  const paths = buildMediaPaths(spec, digest);
  const inspected = await inspectCatalog({ token, spec, digest, paths, fetchImpl, apiBaseUrl });
  return inspected.existingAsset;
}

export async function prepareMediaIntake({ token, mediaBuffer, spec: inputSpec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com" }) {
  const spec = normalizeMediaSpec(inputSpec);
  const digest = sha256Hex(mediaBuffer);
  const paths = buildMediaPaths(spec, digest);
  const inspected = await inspectCatalog({ token, spec, digest, paths, fetchImpl, apiBaseUrl });

  if (inspected.existingAsset) {
    return Object.freeze({
      result: "reuse-existing",
      sha256: digest,
      bytes: mediaBuffer.length,
      existing: inspected.existingAsset,
      repository: spec.repository,
      baseBranch: spec.baseBranch,
    });
  }

  if (inspected.targetPathOccupied) {
    throw new Error(`canonical_path_occupied:${paths.asset}`);
  }

  return Object.freeze({
    result: "new-candidate",
    sha256: digest,
    bytes: mediaBuffer.length,
    paths,
    repository: spec.repository,
    baseBranch: spec.baseBranch,
    _internal: {
      spec,
      catalog: inspected.catalog,
      targetManifest: inspected.targetManifest,
    },
  });
}

async function findOpenPullRequest({ catalog, spec, branch, token, fetchImpl }) {
  const query = new URLSearchParams({
    state: "open",
    head: `${spec.owner}:${branch}`,
    base: spec.baseBranch,
    per_page: "10",
  });
  const pulls = await request({
    fetchImpl,
    url: `${catalog.base}/pulls?${query.toString()}`,
    token,
  });
  if (!Array.isArray(pulls.payload)) throw new Error("github_pulls_invalid");
  return pulls.payload[0] ?? null;
}

async function readBranchRef({catalog, branch, token, fetchImpl }) {
  return request({
    fetchImpl,
    url: `${catalog.base}/git/ref/heads/${encodePath(branch)}`,
    token,
    accepted: [200, 404],
  });
}

async function createDraftPullRequest({catalog, spec, branch, digest, token, fetchImpl }) {
  const existing = await findOpenPullRequest({catalog, spec, branch, token, fetchImpl });
  if (existing) return existing;

  const created = await request({
    fetchImpl,
    url: `${catalog.base}/pulls`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      title: `media(${spec.collection}): registrar ${spec.slug}`,
      head: branch,
      base: spec.baseBranch,
      draft: true,
      body: [
        "## Intake canônico",
        "",
        `- SHA-256: \`${digest}\``,
        `- superfície: \`${spec.surface}\``,
        `- coleção: \`${spec.collection}\``,
        `- papel: \`${spec.role}\``,
        `- origem: \`${spec.sourceType}\``,
        "",
        "Gerado automaticamente pela Site Factory. Nenhum merge ou publicação é executado por este intake.",
      ].join("\n"),
    },
  });
  return created.payload;
}

export async function applyMediaIntake({ token, mediaBuffer, spec: inputSpec, fetchImpl = fetch, apiBaseUrl = "https://api.github.com" }) {
  const prepared = await prepareMediaIntake({ token, mediaBuffer, spec: inputSpec, fetchImpl, apiBaseUrl });

  if (prepared.result === "reuse-existing") {
    return Object.freeze({ applied: false, ...prepared });
  }

  const { spec, catalog, targetManifest } = prepared._internal;
  const { paths } = prepared;
  const existingBranch = await readBranchRef({ catalog, branch: paths.branch, token, fetchImpl });

  if (existingBranch.status === 200) {
    const branchSha = required("branchSha", existingBranch.payload?.object?.sha);
    const pullRequest = await createDraftPullRequest({
      catalog,
      spec,
      branch: paths.branch,
      digest: prepared.sha256,
      token,
      fetchImpl,
    });
    return Object.freeze({
      applied: false,
      result: "reuse-pending-branch",
      repository: spec.repository,
      branch: paths.branch,
      commitSha: branchSha,
      pullRequest: pullRequest
        ? { number: pullRequest.number, url: pullRequest.html_url, draft: pullRequest.draft }
        : null,
      sha256: prepared.sha256,
      bytes: prepared.bytes,
    });
  }

  const manifest = buildManifest({
    existing: targetManifest,
    spec,
    digest: prepared.sha256,
    bytes: prepared.bytes,
  });

  const assetBlob = await request({
    fetchImpl,
    url: `${catalog.base}/git/blobs`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      content: mediaBuffer.toString("base64"),
      encoding: "base64",
    },
  });
  const manifestBlob = await request({
    fetchImpl,
    url: `${catalog.base}/git/blobs`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      content: jsonBuffer(manifest).toString(utf8),
      encoding: "utf-8",
    },
  });

  const tree = await request({
    fetchImpl,
    url: `${catalog.base}/git/trees`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      base_tree: catalog.baseTreeSha,
      tree: [
        {
          path: paths.asset,
          mode: "100644",
          type: "blob",
          sha: required("assetBlobSha", assetBlob.payload?.sha),
        },
        {
          path: paths.manifest,
          mode: "100644",
          type: "blob",
          sha: required("manifestBlobSha", manifestBlob.payload?.sha),
        },
      ],
    },
  });

  const commit = await request({
    fetchImpl,
    url: `${catalog.base}/git/commits`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      message: `media(${spec.collection}): registrar ${spec.slug}`,
      tree: required("newTreeSha", tree.payload?.sha),
      parents: [catalog.baseCommitSha],
    },
  });
  const commitSha = required("commitSha", commit.payload?.sha);

  await request({
    fetchImpl,
    url: `${catalog.base}/git/refs`,
    token,
    method: "POST",
    accepted: [201],
    body: {
      ref: `refs/heads/${paths.branch}`,
      sha: commitSha,
    },
  });

  const pullRequest = await createDraftPullRequest({catalog, spec, branch: paths.branch, digest: prepared.sha256, token, fetchImpl });

  return Object.freeze({
    applied: true,
    result: "draft-pr-created",
    repository: spec.repository,
    branch: paths.branch,
    commitSha,
    pullRequest: {
      number: pullRequest.number,
      url: pullRequest.html_url,
      draft: pullRequest.draft,
    },
    sha256: prepared.sha256,
    bytes: prepared.bytes,
    paths,
  });
}

export const mediaAssetsDefaults = Object.freeze({
  repository: DEFAULT_REPOSITORY,
  baseBranch: DEFAULT_BASE_BRANCH,
});
