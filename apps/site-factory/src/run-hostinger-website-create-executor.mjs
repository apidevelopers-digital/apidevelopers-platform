import {
  buildExecutionEvidence,
  validateCreateAuthorization,
} from "./hostinger-website-create-contract.mjs";
import {
  executeApprovedWebsiteCreation,
} from "./hostinger-website-create-hostinger.mjs";
import {
  publishExecutionEvidence,
  readExecutionEvidence,
  readGithubJson,
} from "./hostinger-website-create-github.mjs";
import {
  readExecutionLock,
} from "./hostinger-website-create-lock.mjs";
import {
  validateExistingExecutionLock,
} from "./hostinger-website-create-lock-validation.mjs";

const DRAFT_REF = "b13fa5992344663b94c8f64dfea5ff448341ec55";
const DRAFT_PATH =
  "apps/site-factory/evidence/hostinger-website-create-draft-latest.json";
const APPROVAL_REF = "1987a754c75ef495a395af356117779b6452ec71";
const APPROVAL_PATH =
  "apps/site-factory/evidence/hostinger-website-create-approval.json";
const EXPECTED_FINGERPRINT =
  "33d5b094f12cbb9a1b5513853d69755ba4f05dced90d8f13fc950ca869c5a1c6";
const MAX_DRAFT_AGE_MS = 6 * 60 * 60 * 1000;

function env(name) {
  const value = process.env[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`missing_environment:${name}`);
  }
  return value.trim();
}

const repository = env("GITHUB_REPOSITORY");
const githubToken = env("GITHUB_TOKEN");
const currentEvidence = await readExecutionEvidence({
  token: githubToken,
  repository,
});

if (currentEvidence) {
  if (
    currentEvidence.source?.draftFingerprint !== EXPECTED_FINGERPRINT
  ) {
    throw new Error("execution_evidence_conflict");
  }

  process.stdout.write(
    `${JSON.stringify({
      status: "already_recorded",
      outcome: currentEvidence.outcome,
      draftFingerprint: currentEvidence.source.draftFingerprint,
      evidenceFingerprint: currentEvidence.fingerprint,
      hostingerPostExecuted: false,
      reason: "single_use_execution_evidence_exists",
    })}\n`,
  );
  process.exit(0);
}

const draft = await readGithubJson({
  token: githubToken,
  repository,
  ref: DRAFT_REF,
  path: DRAFT_PATH,
});
const approval = await readGithubJson({
  token: githubToken,
  repository,
  ref: APPROVAL_REF,
  path: APPROVAL_PATH,
});

const authorization = validateCreateAuthorization({
  draft,
  approval,
  expectedFingerprint: EXPECTED_FINGERPRINT,
  expectedRepository: repository,
  maxDraftAgeMs: MAX_DRAFT_AGE_MS,
});

const lock = await readExecutionLock({
  token: githubToken,
  repository,
});
const lockInfo = validateExistingExecutionLock({
  lock,
  authorization,
  repository,
});

const result = await executeApprovedWebsiteCreation({
  token: env("HOSTINGER_API_TOKEN"),
  draft,
  approval,
  expectedFingerprint: EXPECTED_FINGERPRINT,
  expectedRepository: repository,
  maxDraftAgeMs: MAX_DRAFT_AGE_MS,
});

const evidence = buildExecutionEvidence({
  result,
  repository,
  executionSha: env("GITHUB_SHA"),
  workflowRunId: env("GITHUB_RUN_ID"),
});
const published = await publishExecutionEvidence({
  token: githubToken,
  repository,
  sourceSha: env("GITHUB_SHA"),
  evidence,
});

process.stdout.write(
  `${JSON.stringify({
    status: "completed",
    outcome: evidence.outcome,
    domain: evidence.hostinger.domain,
    datacenterCode: evidence.hostinger.datacenterCode,
    orderReference: evidence.hostinger.orderReference,
    hostingerPostExecuted: evidence.hostinger.postExecuted,
    hostingerPostStatus: evidence.hostinger.postStatus,
    approvalConsumed: evidence.approval.consumed,
    draftFingerprint: evidence.source.draftFingerprint,
    evidenceFingerprint: evidence.fingerprint,
    lockFingerprint: lockInfo.fingerprint,
    ...published,
  })}\n`,
);
