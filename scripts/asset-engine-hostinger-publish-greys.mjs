#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const planPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-plan.json');
const reportPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-report.json');

const expectedConfirmation = 'IGOR_APROVA_ASSET_ENGINE_HOSTINGER_REAL';
const confirmation = process.env.ADA_ASSET_ENGINE_HOSTINGER_CONFIRMATION || '';
const realMode = process.env.ADA_ASSET_ENGINE_DRY_RUN === 'false';

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
}

function report(overrides) {
  return {
    ok: false,
    mode: realMode ? 'real' : 'dry-run',
    step: 'hostinger_publish_gated',
    generated_at: new Date().toISOString(),
    protection: {
      block_when_no_real_assets: true,
      block_when_confirmation_missing: true,
      secrets_in_report: false,
      sftp_executed: false,
    },
    ...overrides,
  };
}

function finish(reportObject, exitCode) {
  writeReport(reportObject);
  process.exit(exitCode);
}

if (!fs.existsSync(planPath)) {
  finish(report({
    error: 'missing_hostinger_publish_plan',
    plan_path: path.relative(root, planPath),
  }), 0);
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
if (plan.safety?.publishes_real_files !== false) {
  finish(report({ error: 'plan_not_dry_run_safe' }), 0);
}

const uploadable = (plan.files || []).filter((file) => file.would_upload);
const realAssets = uploadable.filter((file) => file.kind === 'asset' && file.source_exists);
const htmlFiles = uploadable.filter((file) => file.kind === 'html');

if (realAssets.length === 0) {
  finish(report({
    error: 'real_assets_missing_blocked_publish',
    plan_path: path.relative(root, planPath),
    total_uploadable_files: uploadable.length,
    real_assets: realAssets.length,
    html_files: htmlFiles.length,
    files: uploadable.map((file) => ({
      kind: file.kind,
      source: file.source,
      remote_path: file.remote_path,
      would_upload: file.would_upload,
      reason: file.reason,
    })),
  }), 0);
}

if (realMode && confirmation !== expectedConfirmation) {
  finish(report({
    error: 'missing_explicit_real_publish_confirmation',
    expected_confirmation: expectedConfirmation,
  }), 0);
}

finish(report({
  ok: true,
  error: null,
  plan_path: path.relative(root, planPath),
  total_uploadable_files: uploadable.length,
  real_assets: realAssets.length,
  html_files: htmlFiles.length,
  note: 'Gate passed dry-run. Real SFTP publish is still not implemented in this block.',
}), 0);
