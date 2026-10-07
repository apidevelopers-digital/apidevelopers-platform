#!/usr/bin/env node
import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const execute = args.has('--execute') && process.env.ADA_ASSET_ENGINE_HTTP_VALIDATE_REAL === 'true';

const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const reportPath = path.join(outDir, 'hiddenarquives-greys-http-validation-report.json');
const catalogPath = path.join(root, 'media/catalogs/hiddenarquives/greys.json');
const manifestPath = path.join(outDir, 'hiddenarquives-greys-dry-run-manifest.json');
const planPath = path.join(outDir, 'hostinger-publish-plan.json');

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
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

function requestHead(url) {
  return new Promise((resolve) => {
    const req = https.request(url, { method: 'HEAD', timeout: 15000 }, (res) => {
      res.resume();
      resolve({
        url,
        ok: res.statusCode >= 200 && res.statusCode < 400,
        status_code: res.statusCode,
        content_type: res.headers['content-type'] || null,
        cache_control: res.headers['cache-control'] || null,
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });

    req.on('error', (error) => {
      resolve({
        url,
        ok: false,
        status_code: null,
        error: error.message,
      });
    });

    req.end();
  });
}

const catalog = readJson(catalogPath);
const manifest = readJson(manifestPath);
const plan = readJson(planPath);

const target = catalog?.initialTarget || {};
const publicBaseUrl = `https://${target.subdomain || 'greys.hiddenarquives.tech'}`;
const pageUrl = `${publicBaseUrl}/${target.pagePath || 'greys/index.html'}`;

const manifestStrings = manifest ? collectStrings(manifest) : [];
const planStrings = plan ? collectStrings(plan) : [];

const manifestPublicUrls = manifestStrings.filter((value) => /^https:\/\/[^ ]+/.test(value));
const planPublicUrls = planStrings.filter((value) => /^https:\/\/[^ ]+/.test(value));

const expectedAssetUrls = (catalog?.images || []).map((image) => {
  const fileName = image.source;
  const hashedMatch = manifestStrings.find((value) =>
    typeof value === 'string' &&
    value.includes(fileName.replace(/\.[^.]+$/, '')) &&
    /^https:\/\/[^ ]+/.test(value)
  );

  if (hashedMatch) return hashedMatch;

  const assetPath = target.assetsPath || 'assets/species/greys';
  return `${publicBaseUrl}/${assetPath}/${fileName}`;
});

const urls = unique([
  publicBaseUrl,
  pageUrl,
  ...manifestPublicUrls,
  ...planPublicUrls,
  ...expectedAssetUrls,
]);

const plannedChecks = urls.map((url) => ({
  url,
  method: 'HEAD',
  expected_status: 200,
  executed: false,
}));

let executedChecks = [];
if (execute) {
  executedChecks = await Promise.all(urls.map((url) => requestHead(url)));
}

const ok = execute ? executedChecks.every((check) => check.ok) : true;
const report = {
  ok,
  mode: execute ? 'execute_public_http_head' : 'dry_run_plan_only',
  generated_at: new Date().toISOString(),
  tenant: catalog?.tenant || 'hiddenarquives',
  project: catalog?.project || 'greys',
  domain: target.domain || 'hiddenarquives.tech',
  subdomain: target.subdomain || 'greys.hiddenarquives.tech',
  manifest_present: Boolean(manifest),
  hostinger_plan_present: Boolean(plan),
  url_count: urls.length,
  planned_checks: plannedChecks,
  executed_checks: executedChecks,
  safety: {
    publishes_real_files: false,
    sftp_executed: false,
    dns_changed: false,
    whatsapp_sent: false,
    email_sent: false,
    vnnox_published: false,
    real_http_execution_requires_env_flag: 'ADA_ASSET_ENGINE_HTTP_VALIDATE_REAL=true',
  },
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

console.log(JSON.stringify({
  ok: report.ok,
  mode: report.mode,
  output: path.relative(root, reportPath),
  url_count: report.url_count,
  executed_checks: executedChecks.length,
  failed_checks: executedChecks.filter((check) => !check.ok).length,
}, null, 2));

process.exit(ok ? 0 : 1);
