#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const planPath = path.join(root, 'artifacts/asset-engine/dry-run/hostinger-publish-plan.json');
const outDir = path.join(root, 'artifacts/asset-engine/dry-run');
const outPath = path.join(outDir, 'hostinger-rollback-plan.json');

const approvalPhrase = 'Igor aprova publicação real SFTP do ADA Asset Engine para Hidden Arquives Greys.';
const backupNamespace = '/home/u242521810/domains/hiddenarquives.tech/public_html/_backups/asset-engine/greys/${YYYYMMDD-HHMMSS}';

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function assertInsideRoot(remoteRoot, remotePath) {
  if (!remotePath.startsWith(`${remoteRoot}/`)) {
    throw new Error(`remote_path_outside_allowed_root:${remotePath}`);
  }
}

const publishPlan = readJson(planPath);
const remoteRoot = publishPlan.remote_root;

const uploadCandidates = (publishPlan.files || []).filter((file) => file.would_upload);
for (const file of uploadCandidates) {
  assertInsideRoot(remoteRoot, file.remote_path);
}

const rollbackFiles = uploadCandidates.map((file) => {
  const relativeRemotePath = file.remote_path.slice(`${remoteRoot}/`.length);
  const backupPath = `${backupNamespace}/${relativeRemotePath}`;

  return {
    kind: file.kind,
    title: file.title,
    original_remote_path: file.remote_path,
    backup_path: backupPath,
    restore_action: 'copy_backup_to_original_remote_path',
    delete_action_allowed: false,
    expected_new_sha1: file.sha1,
    expected_new_size_bytes: file.size_bytes,
  };
});

const rollbackPlan = {
  ok: true,
  mode: 'dry-run',
  generated_at: new Date().toISOString(),
  tenant: publishPlan.tenant,
  project: publishPlan.project,
  channel: publishPlan.channel,
  adapter: publishPlan.adapter,
  remote_root: remoteRoot,
  backup_namespace: backupNamespace,
  safety: {
    publishes_real_files: false,
    sftp_executed: false,
    deletes_remote_files: false,
    requires_explicit_approval_for_real_publish: true,
    approval_phrase: approvalPhrase,
  },
  counts: {
    planned_uploads_requiring_backup_check: rollbackFiles.length,
    asset_uploads: rollbackFiles.filter((file) => file.kind === 'asset').length,
    html_uploads: rollbackFiles.filter((file) => file.kind === 'html').length,
  },
  rollback_sequence: [
    'Before real upload, create the timestamped backup namespace.',
    'For each target path, check if a remote file already exists.',
    'If it exists, copy it to the backup namespace preserving the relative path.',
    'Upload new files only after backup checks complete.',
    'If rollback is requested, copy backup files back to their original remote paths.',
    'Do not delete unrelated remote files.',
  ],
  files: rollbackFiles,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify(rollbackPlan, null, 2)}\n`);

console.log(JSON.stringify({
  ok: rollbackPlan.ok,
  output: path.relative(root, outPath),
  planned_uploads_requiring_backup_check: rollbackPlan.counts.planned_uploads_requiring_backup_check,
  asset_uploads: rollbackPlan.counts.asset_uploads,
  html_uploads: rollbackPlan.counts.html_uploads,
}, null, 2));
