#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = process.cwd();
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const reportPath = path.join(outDir, 'hiddenarquives-greys-prepublication-readiness-report.json');

const sourceDir = path.join(root, 'media/sources/hiddenarquives/greys');
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const ingestReportPath = path.join(outDir, 'hiddenarquives-greys-ingest-report.json');
const manifestPath = path.join(outDir, 'hiddenarquives-greys-dry-run-manifest.json');
const htmlPath = path.join(outDir, 'hiddenarquives-greys-index.html');
const hostingerPlanPath = path.join(outDir, 'hostinger-publish-plan.json');

const remoteRoot = '/home/u242521810/domains/hiddenarquives.tech/public_html';
const approvalPhrase = 'Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.';

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function sha1(filePath) {
  return crypto.createHash('sha1').update(fs.readFileSync(filePath)).digest('hex');
}

function collectStrings(value, acc = []) {
  if (typeof value === 'string') {
    acc.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, acc);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectStrings(item, acc);
  }
  return acc;
}

function listFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((name) => /\.(png|jpe?g|webp|avif)$/i.test(name))
    .sort();
}

function status(ok, details = {}) {
  return { ok, ...details };
}

const catalog = readJson(catalogPath);
const expectedSources = (catalog?.images || [])
  .slice()
  .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  .map((asset) => asset.source);

const actualSourceFiles = listFiles(sourceDir);
const expectedSet = new Set(expectedSources);
const actualSet = new Set(actualSourceFiles);
const missingSources = expectedSources.filter((name) => !actualSet.has(name));
const extraSources = actualSourceFiles.filter((name) => !expectedSet.has(name));

const sourceAssets = expectedSources.map((name) => {
  const filePath = path.join(sourceDir, name);
  const exists = fs.existsSync(filePath);
  const size = exists ? fs.statSync(filePath).size : 0;
  return {
    source: name,
    exists,
    size_bytes: size,
    sha1: exists ? sha1(filePath) : null,
    source_path: path.relative(root, filePath),
  };
});

const ingestReport = readJson(ingestReportPath);
const manifest = readJson(manifestPath);
const hostingerPlan = readJson(hostingerPlanPath);
const htmlExists = fs.existsSync(htmlPath);
const htmlSize = htmlExists ? fs.statSync(htmlPath).size : 0;

const manifestStrings = manifest ? collectStrings(manifest) : [];
const manifestSha1Values = manifestStrings.filter((value) => /^[a-f0-9]{40}$/i.test(value));
const manifestHasRealHashes = manifestSha1Values.length >= expectedSources.length;

const planStrings = hostingerPlan ? collectStrings(hostingerPlan) : [];
const absoluteHostingerPaths = planStrings.filter((value) => value.startsWith('/home/'));
const pathsOutsideRemoteRoot = absoluteHostingerPaths.filter((value) => !value.startsWith(remoteRoot));
const planMentionsSources = expectedSources.filter((name) => planStrings.some((value) => value.includes(name)));
const planHasAllAssets = expectedSources.length > 0 && planMentionsSources.length === expectedSources.length;

const sourceReadiness = status(
  expectedSources.length > 0 &&
  actualSourceFiles.length === expectedSources.length &&
  missingSources.length === 0 &&
  extraSources.length === 0 &&
  sourceAssets.every((asset) => asset.exists && asset.size_bytes > 0 && asset.sha1),
  {
    expected_assets: expectedSources.length,
    actual_source_files: actualSourceFiles.length,
    missing_sources: missingSources,
    extra_source_files: extraSources,
  }
);

const ingestReadiness = status(Boolean(ingestReport?.strict_ready), {
  report_exists: Boolean(ingestReport),
  strict_ready: Boolean(ingestReport?.strict_ready),
  status: ingestReport?.status ?? null,
});

const manifestReadiness = status(Boolean(manifest) && manifestHasRealHashes, {
  report_exists: Boolean(manifest),
  detected_sha1_values: manifestSha1Values.length,
  has_real_hashes: manifestHasRealHashes,
});

const renderReadiness = status(htmlExists && htmlSize > 0, {
  html_exists: htmlExists,
  html_size_bytes: htmlSize,
  html_path: path.relative(root, htmlPath),
});

const hostingerPlanReadiness = status(
  Boolean(hostingerPlan) &&
  pathsOutsideRemoteRoot.length === 0 &&
  planHasAllAssets,
  {
    plan_exists: Boolean(hostingerPlan),
    allowed_remote_root: remoteRoot,
    absolute_hostinger_paths: absoluteHostingerPaths.length,
    paths_outside_remote_root: pathsOutsideRemoteRoot,
    planned_expected_assets: planMentionsSources.length,
    plan_has_all_expected_assets: planHasAllAssets,
  }
);

const rollbackReadiness = status(true, {
  required_before_real_publish: true,
  backup_namespace_template: `${remoteRoot}/_backups/asset-engine/greys/YYYYMMDD-HHMMSS/`,
  restore_rule: 'Restore only files listed in the publish plan rollback manifest; do not delete unrelated remote files.',
});

const httpValidationReadiness = status(true, {
  planned_only: true,
  urls_to_validate_after_real_publish: [
    'https://greys.hiddenarquives.tech',
    'each public_url generated in the manifest',
  ],
  expected_status: 200,
});

const safety = {
  publishes_real_files: false,
  sftp_executed: false,
  dns_changed: false,
  whatsapp_sent: false,
  email_sent: false,
  vnnox_published: false,
  requires_explicit_approval_before_real_publish: true,
  approval_phrase: approvalPhrase,
};

const checks = {
  source_readiness: sourceReadiness,
  ingest_readiness: ingestReadiness,
  manifest_readiness: manifestReadiness,
  render_readiness: renderReadiness,
  hostinger_plan_readiness: hostingerPlanReadiness,
  rollback_readiness: rollbackReadiness,
  http_validation_readiness: httpValidationReadiness,
};

const requiredChecks = [
  sourceReadiness.ok,
  ingestReadiness.ok,
  manifestReadiness.ok,
  renderReadiness.ok,
  hostingerPlanReadiness.ok,
];

const readyForApprovalRequest = requiredChecks.every(Boolean);

const report = {
  ok: true,
  generated_at: new Date().toISOString(),
  tenant: catalog?.tenant ?? 'hiddenarquives',
  project: catalog?.project ?? 'greys',
  domain: 'hiddenarquives.tech',
  source_dir: path.relative(root, sourceDir),
  status: readyForApprovalRequest
    ? 'ready_to_request_real_sftp_approval'
    : 'not_ready_for_real_sftp_approval',
  ready_for_real_sftp_approval_request: readyForApprovalRequest,
  checks,
  source_assets: sourceAssets,
  safety,
  next_block: readyForApprovalRequest
    ? 'Request explicit Igor approval for real SFTP publish, then execute publish with backup and HTTP validation.'
    : 'Add approved real assets and regenerate ingest, manifest, render and Hostinger plan artifacts.',
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  ok: report.ok,
  status: report.status,
  ready_for_real_sftp_approval_request: readyForApprovalRequest,
  output: path.relative(root, reportPath),
  failed_required_checks: Object.entries(checks)
    .filter(([key, value]) => ['source_readiness', 'ingest_readiness', 'manifest_readiness', 'render_readiness', 'hostinger_plan_readiness'].includes(key) && !value.ok)
    .map(([key]) => key),
}, null, 2));

// This script is a readiness report. It does not fail when assets are absent;
// strict failure belongs to asset-engine-ingest-greys.mjs --strict.
process.exit(0);
