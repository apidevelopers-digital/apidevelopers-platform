#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const planPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-plan.json');
const reportPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-report.json');

const expectedConfirmation = 'IGOR_APROVA_ASSET_ENGINE_HOSTINGER_REAL';
const confirmation = process.env.ADA_ASSET_ENGINE_HOSTINGER_CONFIRMATION || '';
const dryRun = process.env.ADA_ASSET_ENGINE_DRY_RUN !== 'false';

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
}

function fail(error, extra = {}) {
  const report = {
    ok: false,
    mode: dryRun ? 'dry-run' : 'real',
    step: 'hostinger_publish_gated',
    error,
    generated_at: new Date().toISOString(),
    ...extra,
  };
  writeReport(report);
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}

if (!fs.existsSync(planPath)) {
  fail('missing_hostinger_publish_plan', { plan_path: path.relative(root, planPath) });
}

const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));

if (plan.safety?.publishes_real_files !== false) {
  fail('plan_not_dry_run_safe');
}

const uploadable = (plan.files || []).filter((file) => file.would_upload);
const realAssets = uploadable.filter((file) => file.kind === 'asset' && file.source_exists);
const htmlFiles = uploadable.filter((file) => file.kind === 'html');

if (realAssets.length === 0) {
  fail('real_assets_missing_blocked_publish', {
    note: 'Place approved images in media/sources/hiddenarquives/greys/ before real publish.',
    uploadable_files: uploadable.length,
    real_assets: realAssets.length,
    html_files: htmlFiles.length,
  });
}

if (!dryRun && confirmation !== expectedConfirmation) {
  fail('missing_explicit_real_publish_confirmation', {
    expected_confirmation: expectedConfirmation,
    dry_run: dryRun,
  });
}

const report = {
  ok: true,
  mode: dryRun ? 'dry-run' : 'real',
  step: 'hostinger_publish_gated',
  generated_at: new Date().toISOString(),
  dry_run: dryRun,
  confirmation_required: expectedConfirmation,
  plan_path: path.relative(root, planPath),
  total_uploadable_files: uploadable.length,
  real_assets: realAssets.length,
  html_files: htmlFiles.length,
  protection: {
    block_when_no_real_assets: true,
    block_when_confirmation_missing: true,
    secrets_in_report: false,
    sftp_executed: false,
  },
  files: uploadable.map((file) => ({
    kind: file.kind,
    source: file.source,
    remote_path: file.remote_path,
    public_url: file.public_url,
    would_upload: file.would_upload,
    reason: file.reason,
  })),
};

if (dryRun) {
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

// Real SFTP publish intentionally remains blocked in this contract.
// The next block must implement SFTP + reverse verify + HTTP verify + rollback report.
fail('real_publish_not_implemented_yet', {
  note: 'Blocked by design: next block must implement SFTP, reverse verification, HTTP verification and rollback report.',
});
