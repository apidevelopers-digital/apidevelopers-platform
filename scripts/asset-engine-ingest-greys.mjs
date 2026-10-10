#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const strict = process.argv.includes('--strict') || process.env.ADA_ASSET_ENGINE_INGEST_STRICT === 'true';
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const sourceDir = path.join(root, 'media/sources/hiddenarquives/greys');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hiddenarquives-greys-ingest-report.json');

function sha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
const expected = (catalog.images || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((asset) => asset.source);

const actual = fs.existsSync(sourceDir)
  ? fs.readdirSync(sourceDir).filter((name) => /\.(png|jpe?g|webp|avif)$/i.test(name)).sort()
  : [];

const expectedSet = new Set(expected);
const actualSet = new Set(actual);
const missing = expected.filter((name) => !actualSet.has(name));
const extra = actual.filter((name) => !expectedSet.has(name));

const assets = (catalog.images || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((asset) => {
    const filePath = path.join(sourceDir, asset.source);
    const exists = fs.existsSync(filePath);
    return {
      order: asset.order,
      role: asset.role,
      title: asset.title,
      source: asset.source,
      source_path: path.relative(root, filePath),
      source_exists: exists,
      sha1: exists ? sha1(filePath) : null,
      size_bytes: exists ? fs.statSync(filePath).size : 0,
    };
  });

const strictReady = missing.length === 0 && extra.length === 0 && expected.length > 0;
const report = {
  ok: strict ? strictReady : true,
  mode: strict ? 'strict' : 'allow-missing',
  generated_at: new Date().toISOString(),
  tenant: catalog.tenant,
  project: catalog.project,
  source_dir: path.relative(root, sourceDir),
  status: strictReady ? 'ready_for_manifest_with_real_hashes' : actual.length ? 'partial_assets_present' : 'waiting_for_approved_assets',
  strict_ready: strictReady,
  counts: {
    expected_assets: expected.length,
    actual_source_files: actual.length,
    found_expected_assets: expected.length - missing.length,
    missing_expected_assets: missing.length,
    extra_source_files: extra.length,
  },
  expected_sources: expected,
  actual_source_files: actual,
  missing_sources: missing,
  extra_source_files: extra,
  assets,
  safety: {
    publishes_real_files: false,
    sftp_executed: false,
    secrets_included: false,
    approval_required_before_publish: true,
    approval_phrase: 'Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.',
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  status: report.status,
  output: path.relative(root, outPath),
  counts: report.counts,
}, null, 2));
process.exit(report.ok ? 0 : 1);
