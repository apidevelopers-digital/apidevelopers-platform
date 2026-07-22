const fs = require('fs');
const cp = require('child_process');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

const mode = required('MODE');
const targetRef = required('TARGET_REF');
const repository = required('REPOSITORY');
const runId = required('RUN_ID');
const eventName = required('EVENT_NAME');
const targetSha = cp.execSync('git rev-parse HEAD').toString().trim();
const generatedAt = new Date().toISOString();
const commitMessage = cp.execSync('git log -1 --pretty=%s').toString().trim();
const candidate = mode === 'candidate';

const successfulRuns = candidate ? [] : [{
  id: Number(runId),
  workflow: 'UNI Operator Reanchor',
  conclusion: 'success',
  url: `https://github.com/${repository}/actions/runs/${runId}`
}];

const openPullRequests = process.env.PR_NUMBER ? [{
  number: Number(process.env.PR_NUMBER),
  title: process.env.PR_TITLE || '',
  head: targetRef,
  base: process.env.PR_BASE || '',
  url: process.env.PR_URL || ''
}] : [];

const state = {
  schema_version: '1.0.0',
  generated_at: generatedAt,
  repository,
  target_ref: targetRef,
  target_sha: targetSha,
  validation: {
    status: candidate ? 'candidate' : 'published',
    successful_action_runs: successfulRuns
  },
  open_pull_requests: openPullRequests,
  continuity: {
    source_of_truth: 'published_git_ref_plus_successful_github_actions',
    chat_memory_authoritative: false,
    canonical_documents_authoritative: false
  }
};

const evidence = {
  ...state,
  event_name: eventName,
  commit_message: commitMessage
};

fs.mkdirSync('operator-reanchor', { recursive: true });
fs.writeFileSync('operator-reanchor/operator.state.json', JSON.stringify(state, null, 2) + '\n');
fs.writeFileSync('operator-reanchor/evidence.json', JSON.stringify(evidence, null, 2) + '\n');

JSON.parse(fs.readFileSync('operator-reanchor/operator.state.json', 'utf8'));
JSON.parse(fs.readFileSync('operator-reanchor/evidence.json', 'utf8'));
