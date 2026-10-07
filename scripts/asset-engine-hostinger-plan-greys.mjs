#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'artifacts/asset-engine/dry-run/hiddenarquives-greys-dry-run-manifest.json');
const htmlPath = path.join(root, 'artifacts/asset-engine/dry-run/hiddenarquives-greys-index.html');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hostinger-publish-plan.json');

const allowedRemoteRoot = '/home/u242521810/domains/hiddenarquives.tech/public_html';

function normalizeRemote(relativePath) {
  const cleaned = String(relativePath || '')
    .replaceAll('\\\\', '/')
    .replace(/^\\/+/, '')
    .replace(/\\/+/g, '/');

  if (!cleaned || cleaned.includes('..')) {
    throw new Error(`unsafe_relative_path:${relativePath}`);
  }

  return `${allowedRemoteRoot}/${cleaned}`;
}

function assertInsideAllowedRoot(remotePath) {
  if (!remotePath.startsWith(`${allowedRemoteRoot}/`)) {
    throw new Error(`remote_path_outside_allowed_root:${remotePath}`);
  }
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const htmlExists = fs.existsSync(htmlPath);

const files = [];

for (const asset of manifest.assets || []) {
  const remotePath = normalizeRemote(`${manifest.target?.assetsPath || `assets/species/${manifest.project}`}/${asset.filename}`);
  assertInsideAllowedRoot(remotePath);

  files.push({
    kind: 'asset',
    role: asset.role,
    title: asset.title,
    source: asset.source,
    source_exists: asset.source_exists,
    source_path: asset.source_path,
    filename: asset.filename,
    sha1: asset.sha1,
    size_bytes: asset.size_bytes,
    public_url: asset.public_url,
    remote_path: remotePath,
    would_upload: Boolean(asset.source_exists),
    reason: asset.source_exists ? 'source_available' : 'source_missing_placeholder_only'
  });
}

const pageRemotePath = normalizeRemote(manifest.target?.pagePath || 'greys/index.html');
assertInsideAllowedRoot(pageRemotePath);

files.push({
  kind: 'html',
  role: 'page',
  title: `${manifest.title} generated page`,
  source: path.relative(root, htmlPath),
  source_exists: htmlExists,
  filename3: path.basename(pageRemotePath),
  sha1: null,
  size_bytes: htmlExists ? fs.statSync(htmlPath).size : 0,
  public_url: manifest.target?.subdomain ? `https://${manifest.target.subdomain}` : null,
  remote_path: pageRemotePath,
  would_upload: htmlExists,
  reason: htmlExists ? 'html_preview_available' : 'html_preview_missing'
});

const plan = {
  ok: true,
  mode: 'dry-run',
  generated_at: new Date().toISOString(),
  tenant: manifest.tenant,
  project: manifest.project,
  channel: 'hostinger-site',
  adapter: 'HostingerStaticAdapter',
  remote_root: allowedRemoteRoot,
  target: manifest.target,
  safety: {
    publishes_real_files: false,
    requires_explicit_approval_for_real_publish: true,
    validates_remote_root: true,
    secrets_included: false
  },
  counts: {
    total_files_planned: files.length,
    uploadable_files: files.filter((file) => file.would_upload).length,
    placeholder_assets: files.filter((file) => file.kind === 'asset' && !file.source_exists).length
  },
  files
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(plan, null, 2)}\n`);

console.log(JSON.stringify {
  ok: plan.ok,
  output: path.relative(root, outPath),
  total_files_planned: plan.counts.total_files_planned,
  uploadable_files: plan.counts.uploadable_files,
  placeholder_assets: plan.counts.placeholder_assets
}, null, 2));
