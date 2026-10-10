#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const sourceDir = path.join(root, 'media/sources/hiddenarquives/greys');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hiddenarquives-greys-dry-run-manifest.json');

function clean(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fileExtension(source) {
  const match = String(source).match(/\.(png|jpe?g|webp|avif)$/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function sha1File(filePath) {
  const bytes = fs.readFileSync(filePath);
  return {
    sha1: crypto.createHash('sha1').update(bytes).digest('hex'),
    size_bytes: bytes.length,
  };
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog.tenant) errors.push('missing_tenant');
  if (!catalog.project) errors.push('missing_project');
  if (!catalog.title) errors.push('missing_title');
  if (!Array.isArray(catalog.images)) errors.push('images_not_array');
  return errors;
}

function normalizePath(value) {
  return String(value).replace(/^\/+/, '').replace(/\/+$/, '');
}

function assetId({ tenant, project, role, sha1 }) {
  return `ast_${[tenant, project, role, sha1.slice(0, 8)]
    .filter(Boolean)
    .join('_')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase()}`;
}

function buildAsset({ catalog, item, defaultHash, publicBaseUrl, assetsPath }) {
  const sourcePath = path.join(sourceDir, item.source);
  const sourceExists = fs.existsSync(sourcePath);
  const hashInfo = sourceExists ? sha1File(sourcePath) : { sha1: defaultHash, size_bytes: 0 };
  const shortHash = hashInfo.sha1.slice(0, 8);
  const baseName = clean(`${catalog.project}-${item.role}-${item.title}`);
  const filename = `${baseName}-${shortHash}.${fileExtension(item.source)}`;
  const public_url = `${publicBaseUrl.replace(/\/+$/, '')}/${normalizePath(assetsPath)}/${filename}`;

  return {
    source: item.source,
    source_exists: sourceExists,
    source_path: path.relative(root, sourcePath),
    filename,
    public_url,
    role: item.role,
    title: item.title,
    caption: item.caption,
    asset_id: assetId({
      tenant: catalog.tenant,
      project: catalog.project,
      role: item.role,
      sha1: hashInfo.sha1,
    }),
    sha1: hashInfo.sha1,
    size_bytes: hashInfo.size_bytes,
  };
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const errors = validateCatalog(catalog);
const defaultHash = 'dryrun000000000000000000000000000000000000';
const publicBaseUrl = 'https://hiddenarquives.tech';
const assetsPath = catalog.initialTarget?.assetsPath || `assets/species/${catalog.project}`;

const assets = errors.length
  ? []
  : catalog.images
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((item) => buildAsset({ catalog, item, defaultHash, publicBaseUrl, assetsPath }));

const sourcesFound = assets.filter((asset) => asset.source_exists).length;
const sourcesMissing = assets.filter((asset) => !asset.source_exists).map((asset) => asset.source);

const manifest = {
  ok: errors.length === 0,
  mode: 'dry-run',
  generated_at: new Date().toISOString(),
  tenant: catalog.tenant,
  project: catalog.project,
  title: catalog.title,
  target: catalog.initialTarget,
  source_dir: path.relative(root, sourceDir),
  has_real_hashes: sourcesFound > 0,
  sources_total: assets.length,
  sources_found: sourcesFound,
  sources_missing: sourcesMissing,
  errors,
  assets,
  report: {
    ok: errors.length === 0,
    tenant: catalog.tenant,
    project: catalog.project,
    channel: 'hostinger-site',
    assets_total: assets.length,
    assets_with_real_hash: sourcesFound,
    assets_with_placeholder_hash: assets.length - sourcesFound,
    assets_published: 0,
    assets_verified: 0,
    http_200: 0,
    html_updated: false,
    html_verified: false,
    rollback_available: false,
    errors,
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: manifest.ok,
  output: path.relative(root, outPath),
  assets_total: assets.length,
  sources_found: sourcesFound,
  sources_missing: sourcesMissing.length,
  has_real_hashes: manifest.has_real_hashes,
}, null, 2));

process.exit(manifest.ok ? 0 : 1);
