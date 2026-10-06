#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hiddenarquives-greys-dry-run-manifest.json');

function sanitizeFragment(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function fileExtension(source) {
  const match = String(source).match(/\.(png|jpg|jpeg|webp|avif)$/i);
  return match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png';
}

function normalizePath(value) {
  return String(value).replace(/^\/+/, '').replace(/\/+$/, '');
}

function validateCatalog(catalog) {
  const errors = [];
  if (!catalog.tenant) errors.push('missing_tenant');
  if (!catalog.project) errors.push('missing_project');
  if (!catalog.title) errors.push('missing_title');
  if (!Array.isArray(catalog.images)) errors.push('images_not_array');
  return errors;
}

function assetId({ tenant, project, role, sha1 }) {
  return `ast_${[tenant, project, role, sha1.slice(0, 8)]
    .filter(Boolean)
    .join('_')
    .replace(/[^a-z0-9_-]/gi, '_')
    .toLowerCase()}`;
}

function generate(catalog) {
  const errors = validateCatalog(catalog);
  const defaultHash = 'dryrun000000000000000000000000000000000000';
  const publicBaseUrl = 'https://hiddenarquives.tech';
  const assetsPath = catalog.initialTarget?.assetsPath || `assets/species/${catalog.project}`;

  const assets = errors.length ? [] : catalog.images
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((item) => {
      const shortHash = defaultHash.slice(0, 8);
      const base = sanitizeFragment(`${catalog.project}-${item.role}-${item.title}`);
      const filename = `${base}-${shortHash}.${fileExtension(item.source)}`;
      const public_url = `${publicBaseUrl}/${normalizePath(assetsPath)}/${filename}`;
      return {
        source: item.source,
        filename,
        public_url,
        role: item.role,
        title: item.title,
        caption: item.caption,
        asset_id: assetId({
          tenant: catalog.tenant,
          project: catalog.project,
          role: item.role,
          sha1: defaultHash,
        }),
        sha1: defaultHash,
      };
    });

  return {
    ok: errors.length === 0,
    mode: 'dry-run',
    generated_at: new Date().toISOString(),
    tenant: catalog.tenant,
    project: catalog.project,
    title: catalog.title,
    target: catalog.initialTarget,
    errors,
    assets,
    report: {
      ok: errors.length === 0,
      tenant: catalog.tenant,
      project: catalog.project,
      channel: 'hostinger-site',
      assets_total: assets.length,
      assets_published: 0,
      assets_verified: 0,
      http_200: 0,
      html_updated: false,
      html_verified: false,
      rollback_available: false,
      errors,
    },
  };
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const manifest = generate(catalog);

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');

console.log(JSON.stringify({
  ok: manifest.ok,
  output: outPath,
  assets_total: manifest.assets.length,
}, null, 2));

process.exit(manifest.ok ? 0 : 1);
