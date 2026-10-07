#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const manifestPath = path.join(root, 'artifacts/asset-engine/dry-run/hiddenarquives-greys-dry-run-manifest.json');
const publishPlanPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-plan.json');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hostinger-http-validation-plan.json');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

const manifest = readJson(manifestPath);
const publishPlan = readJson(publishPlanPath);
const baseUrl = manifest.target?.subdomain ? `https://${manifest.target.subdomain}` : 'https://greys.hiddenarquives.tech';

const urls = unique([
  baseUrl,
  ...(manifest.assets || []).map((asset) => asset.public_url),
]);

const checks = urls.map((url) => ({
  url,
  method: 'HEAD',
  expected_status: 200,
  follow_redirects: true,
  real_http_executed: false,
}));

const validationPlan = {
  ok: true,
  mode: 'dry-run',
  generated_at: new Date().toISOString(),
  tenant: manifest.tenant,
  project: manifest.project,
  channel: 'hostinger-site',
  base_url: baseUrl,
  publish_plan: {
    remote_root: publishPlan.remote_root,
    total_files_planned: publishPlan.counts?.total_files_planned ?? null,
    uploadable_files: publishPlan.counts?.uploadable_files ?? null,
    placeholder_assets: publishPlan.counts?.placeholder_assets ?? null,
  },
  safety: {
    performs_real_http_requests: false,
    publishes_real_files: false,
    sftp_executed: false,
    requires_post_publish_execution_after_real_publish: true,
  },
  acceptance_criteria_after_real_publish: [
    'Base URL returns HTTP 200.',
    'Generated HTML page returns HTTP 200.',
    'Every manifest asset public_url returns HTTP 200.',
    'No URL points outside the expected Hidden Arquives / Greys domain.',
    'The validation report records checked_at timestamps and response statuses.',
  ],
  counts: {
    planned_http_checks: checks.length,
    asset_url_checks: Math.max(checks.length - 1, 0),
  },
  checks,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(validationPlan, null, 2)}\n`);

console.log(JSON.stringify({
  ok: validationPlan.ok,
  output: path.relative(root, outPath),
  planned_http_checks: validationPlan.counts.planned_http_checks,
  asset_url_checks: validationPlan.counts.asset_url_checks,
}, null, 2));
