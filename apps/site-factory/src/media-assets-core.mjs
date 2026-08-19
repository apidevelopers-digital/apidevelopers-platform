import { createHash } from "node:crypto";

export const MEDIA_DEFAULTS = Object.freeze({
  repository: "apidevelopers-digital/apidevelopers-media-assets",
  baseBranch: "main",
});

const SAFE = /^[a-z0-9][a-z0-9._-]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const EXT = new Set([".avif",".gif",".jpeg",".jpg",".mov",".mp4",".pdf",".png",".svg",".webm",".webp"]);

function req(name, value) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`missing_or_invalid:${name}`);
  return value.trim();
}
function safe(name, value) {
  const v = req(name, value).toLowerCase();
  if (!SAFE.test(v)) throw new Error(`invalid_token:${name}`);
  return v;
}
function pos(name, value) {
  if (value === undefined || value === null || value === "") return undefined;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`invalid_positive_integer:${name}`);
  return n;
}
function usage(input) {
  if (!input.usageSurface && !input.usageRepository && input.usagePr === undefined) return null;
  const out = {};
  if (input.usageSurface) out.surface = req("usageSurface", input.usageSurface);
  if (input.usageRepository) out.repository = req("usageRepository", input.usageRepository);
  if (input.usagePr !== undefined) out.pr = pos("usagePr", input.usagePr);
  return out;
}

export function sha256Hex(buffer) {
  if (!Buffer.isBuffer(buffer)) throw new Error("invalid_media_buffer");
  return createHash("sha256").update(buffer).digest("hex");
}

export function normalizeMediaSpec(input = {}) {
  const repository = req("repository", input.repository ?? MEDIA_DEFAULTS.repository);
  const parts = repository.split("/");
  if (parts.length !== 2 || parts.some((v) => !v)) throw new Error("invalid_repository");
  const sourceName = req("sourceName", input.sourceName);
  const dot = sourceName.lastIndexOf(".");
  const extension = dot >= 0 ? sourceName.slice(dot).toLowerCase() : "";
  if (!EXT.has(extension)) throw new Error(`unsupported_media_extension:${extension || "none"}`);
  const date = req("date", input.date);
  if (!DATE.test(date)) throw new Error("invalid_date");
  return Object.freeze({
    repository,
    owner: parts[0],
    repo: parts[1],
    baseBranch: req("baseBranch", input.baseBranch ?? MEDIA_DEFAULTS.baseBranch),
    surface: safe("surface", input.surface),
    collection: safe("collection", input.collection),
    date,
    role: safe("role", input.role),
    slug: safe("slug", input.slug),
    extension,
    status: safe("status", input.status ?? "candidate"),
    sourceType: safe("sourceType", input.sourceType ?? "generated"),
    provenance: req("provenance", input.provenance),
    width: pos("width", input.width),
    height: pos("height", input.height),
    usage: usage(input),
  });
}

export function buildMediaPaths(spec, digest) {
  const hash = req("sha256", digest).toLowerCase();
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
  const n = Number(bytes);
  if (!Number.isInteger(n) || n < 0) throw new Error("invalid_media_bytes");
  const asset = { path: `${spec.role}/${spec.slug}${spec.extension}`, bytes: n, sha256: digest };
  if (spec.width) asset.width = spec.width;
  if (spec.height) asset.height = spec.height;

  if (!existing) {
    return {
      schema: "apidevelopers.media-assets/v1",
      collection: `${spec.surface}/${spec.collection}`,
      date: spec.date,
      status: spec.status,
      source: { type: spec.sourceType, provenance: spec.provenance },
      assets: [asset],
      usage: spec.usage ? [spec.usage] : [],
    };
  }

  const out = structuredClone(existing);
  if (out.collection !== `${spec.surface}/${spec.collection}`) throw new Error("manifest_collection_mismatch");
  if (out.date !== spec.date) throw new Error("manifest_date_mismatch");
  if (!Array.isArray(out.assets)) throw new Error("manifest_assets_invalid");
  if (out.assets.some((v) => v?.path === asset.path)) throw new Error("manifest_asset_path_already_exists");
  out.assets.push(asset);

  if (out.source && typeof out.source === "object") {
    const extra = Array.isArray(out.source.additional_provenance) ? [...out.source.additional_provenance] : [];
    const item = { type: spec.sourceType, provenance: spec.provenance };
    if (!extra.some((v) => JSON.stringify(v) === JSON.stringify(item))) extra.push(item);
    if (extra.length) out.source.additional_provenance = extra;
  }

  if (spec.usage) {
    const list = out.usage == null ? [] : Array.isArray(out.usage) ? [...out.usage] : [out.usage];
    if (!list.some((v) => JSON.stringify(v) === JSON.stringify(spec.usage))) list.push(spec.usage);
    out.usage = list;
  }
  return out;
}
